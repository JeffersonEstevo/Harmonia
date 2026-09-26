"""
Pipeline de análise Camada 2 (Tier 2) — ver docs/SPEC.md §6.4 e §4.4.

Usa essentia (HPCP + ChordsDetection + KeyExtractor + RhythmExtractor2013)
em vez de treinar um modelo próprio do zero — ver docs/DECISIONS.md pelo
raciocínio completo. HPCP já é substancialmente mais robusto que o
chromagram por FFT linear do Nível 1 (client-side): usa detecção de picos
espectrais, estimação de tuning frequency e ponderação harmônica adequada.
"""

from __future__ import annotations

from dataclasses import dataclass

import essentia.standard as es
import numpy as np

FRAME_SIZE = 4096
HOP_SIZE = 2048
MIN_SEGMENT_SECONDS = 0.3


@dataclass
class ChordSegment:
    chord: str
    onset: float
    offset: float
    confidence: float


@dataclass
class AnalysisResult:
    chord_segments: list[ChordSegment]
    key: str | None
    key_scale: str | None
    key_confidence: float
    bpm: float | None
    beat_times: list[float]


def _compute_hpcp_frames(audio: np.ndarray, sample_rate: float) -> np.ndarray:
    windowing = es.Windowing(type="hann")
    spectrum = es.Spectrum()
    spectral_peaks = es.SpectralPeaks(sampleRate=sample_rate)
    hpcp = es.HPCP(sampleRate=sample_rate)

    frames = []
    for frame in es.FrameGenerator(
        audio, frameSize=FRAME_SIZE, hopSize=HOP_SIZE, startFromZero=True
    ):
        spec = spectrum(windowing(frame))
        freqs, mags = spectral_peaks(spec)
        frames.append(hpcp(freqs, mags))
    return np.array(frames) if frames else np.zeros((0, 12), dtype=np.float32)


def _encode_chord_segments(
    chords: list[str], strengths: list[float], hop_size: int, sample_rate: float
) -> list[ChordSegment]:
    """Codifica a sequência de acordes por frame em segmentos onset/offset,
    fundindo segmentos mais curtos que MIN_SEGMENT_SECONDS no vizinho —
    mesmo princípio do Nível 1 (client-side), aqui em Python."""
    if not chords:
        return []

    frame_dur = hop_size / sample_rate
    raw_segments: list[tuple[str, float, float, float]] = []
    i = 0
    while i < len(chords):
        chord = chords[i]
        j = i + 1
        while j < len(chords) and chords[j] == chord:
            j += 1
        onset = i * frame_dur
        offset = j * frame_dur
        avg_strength = float(np.mean(strengths[i:j]))
        raw_segments.append((chord, onset, offset, avg_strength))
        i = j

    merged: list[tuple[str, float, float, float]] = []
    for chord, onset, offset, strength in raw_segments:
        if merged and (offset - onset) < MIN_SEGMENT_SECONDS:
            prev_chord, prev_onset, _prev_offset, prev_strength = merged[-1]
            merged[-1] = (prev_chord, prev_onset, offset, prev_strength)
        else:
            merged.append((chord, onset, offset, strength))

    return [
        ChordSegment(chord=chord, onset=onset, offset=offset, confidence=strength)
        for chord, onset, offset, strength in merged
        if chord not in ("N", "N/C", "") and strength > 0.05
    ]


def analyze(audio: np.ndarray, sample_rate: float) -> AnalysisResult:
    """Roda o pipeline completo (acordes + tonalidade + tempo) sobre um
    array mono float32 normalizado em [-1, 1]."""
    hpcp_frames = _compute_hpcp_frames(audio, sample_rate)

    chords_detector = es.ChordsDetection()
    if len(hpcp_frames) > 0:
        chords, strengths = chords_detector(hpcp_frames)
        chord_segments = _encode_chord_segments(
            list(chords), list(strengths), HOP_SIZE, sample_rate
        )
    else:
        chord_segments = []

    key_extractor = es.KeyExtractor()
    key, scale, key_strength = key_extractor(audio)

    rhythm_extractor = es.RhythmExtractor2013()
    bpm, beat_times, _confidence, _estimates, _intervals = rhythm_extractor(audio)

    return AnalysisResult(
        chord_segments=chord_segments,
        key=key,
        key_scale=scale,
        key_confidence=float(key_strength),
        bpm=float(bpm) if bpm > 0 else None,
        beat_times=[float(t) for t in beat_times],
    )
