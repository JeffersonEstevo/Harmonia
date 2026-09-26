"""Decodificação de áudio pra mono float32 — aceita os mesmos formatos do
Nível 1 (MP3, WAV, FLAC, OGG). soundfile cobre WAV/FLAC/OGG nativamente;
MP3 depende do libsndfile ter suporte a MP3 (versões recentes têm) — ver
docs/DECISIONS.md se precisar de um fallback via ffmpeg no futuro."""

from __future__ import annotations

import io

import numpy as np
import soundfile as sf


def decode_audio_to_mono(raw_bytes: bytes) -> tuple[np.ndarray, float]:
    data, sample_rate = sf.read(io.BytesIO(raw_bytes), always_2d=True, dtype="float32")
    mono = data.mean(axis=1).astype(np.float32)
    return mono, float(sample_rate)
