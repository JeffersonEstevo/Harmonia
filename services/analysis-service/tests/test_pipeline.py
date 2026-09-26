"""
Testes do pipeline de análise com áudio sintético — mesmo princípio do
wasm-dsp/smoke-test.mjs (Nível 1): sintetiza tons com harmônicos realistas
e percussão, valida contra o resultado esperado. Ver docs/DECISIONS.md.
"""

from __future__ import annotations

import numpy as np
import pytest

from analysis_service.pipeline import analyze

SAMPLE_RATE = 44100.0


def note_freq(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def realistic_chord(root_midis: list[float], seconds: float) -> np.ndarray:
    n = int(SAMPLE_RATE * seconds)
    t = np.arange(n) / SAMPLE_RATE
    out = np.zeros(n, dtype=np.float32)
    harmonics = [1.0, 0.5, 0.3, 0.15, 0.08]
    for root in root_midis:
        f0 = note_freq(root)
        for h, amp in enumerate(harmonics):
            out += (0.2 / len(root_midis)) * amp * np.sin(2 * np.pi * f0 * (h + 1) * t).astype(
                np.float32
            )
    return out


def add_percussion(samples: np.ndarray, bpm: float, seed: int = 42) -> np.ndarray:
    beat = int(60 / bpm * SAMPLE_RATE)
    rng = np.random.default_rng(seed)
    for start in range(0, len(samples), beat):
        end = min(start + 800, len(samples))
        n = end - start
        env = np.exp(-np.arange(n) / 150)
        samples[start:end] += 0.35 * (rng.random(n) * 2 - 1) * env
    return samples


def dominant_chord_in_window(result, start: float, end: float) -> str | None:
    """Acorde com maior duração total dentro da janela [start, end)."""
    durations: dict[str, float] = {}
    for seg in result.chord_segments:
        overlap_start = max(seg.onset, start)
        overlap_end = min(seg.offset, end)
        if overlap_end > overlap_start:
            durations[seg.chord] = durations.get(seg.chord, 0.0) + (overlap_end - overlap_start)
    if not durations:
        return None
    return max(durations, key=durations.get)


@pytest.fixture
def bm_g_d_a_progression() -> np.ndarray:
    """A mesma progressão relatada pelo usuário: Bm - G - D - A."""
    progression = [
        [59, 62, 66],  # Bm: B3 D4 F#4
        [55, 59, 62],  # G:  G3 B3 D4
        [50, 54, 57],  # D:  D3 F#3 A3
        [57, 61, 64],  # A:  A3 C#4 E4
    ]
    full = np.concatenate([realistic_chord(notes, 2.0) for notes in progression])
    full = add_percussion(full, 130)
    return (full / np.max(np.abs(full)) * 0.9).astype(np.float32)


def test_bm_g_d_a_progression_recognized_correctly(bm_g_d_a_progression):
    result = analyze(bm_g_d_a_progression, SAMPLE_RATE)

    assert dominant_chord_in_window(result, 0.3, 1.7) == "Bm"
    assert dominant_chord_in_window(result, 2.3, 3.7) == "G"
    assert dominant_chord_in_window(result, 4.3, 5.7) == "D"
    assert dominant_chord_in_window(result, 6.3, 7.7) == "A"


def test_key_detection_on_known_progression(bm_g_d_a_progression):
    result = analyze(bm_g_d_a_progression, SAMPLE_RATE)
    # Bm-G-D-A é diatônico de Ré maior / Si menor (relativas) — aceita as duas
    assert result.key in ("D", "B")


def test_tempo_detection():
    beat_interval = 60 / 130
    n = int(SAMPLE_RATE * 8)
    samples = np.zeros(n, dtype=np.float32)
    t = 0.0
    while t < 8:
        start = int(t * SAMPLE_RATE)
        length = min(400, n - start)
        env = np.exp(-np.arange(length) / 60)
        samples[start : start + length] += 0.9 * env * np.sin(
            2 * np.pi * 1000 * np.arange(length) / SAMPLE_RATE
        )
        t += beat_interval

    result = analyze(samples, SAMPLE_RATE)
    assert result.bpm is not None
    # tolera múltiplo/submúltiplo (ambiguidade de oitava rítmica é normal)
    assert any(abs(result.bpm - 130 * m) < 4 for m in (0.5, 1, 2))


def test_silence_produces_no_chords():
    samples = np.zeros(int(SAMPLE_RATE * 2), dtype=np.float32)
    result = analyze(samples, SAMPLE_RATE)
    assert result.chord_segments == []
