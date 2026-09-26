"""
API do analysis-service — ver docs/SPEC.md §6.6 (contrato de API planejado)
e docs/DECISIONS.md (simplificações desta fase: sem fila externa/S3 ainda).

POST /analyze          -> aceita o arquivo, retorna { job_id }
GET  /jobs/{job_id}    -> polling simples (fallback sem WebSocket)
WS   /ws/jobs/{job_id} -> progresso + resultado via push
"""

from __future__ import annotations

import asyncio
import uuid
from concurrent.futures import ThreadPoolExecutor
from enum import Enum
from typing import Any

from fastapi import FastAPI, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from analysis_service.audio_io import decode_audio_to_mono
from analysis_service.pipeline import analyze

app = FastAPI(title="Harmonia — analysis-service")

# CORS liberado pro dev local (apps/web em outra porta) — apertar quando
# houver domínio real de produção (ver docs/SPEC.md NFR Segurança).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pool de threads pro trabalho pesado (essentia é C++ nativo, libera o GIL
# na maior parte do tempo de processamento) — evita bloquear o event loop
# do FastAPI. Ver docs/DECISIONS.md: um upgrade real pra Redis Streams +
# workers separados fica pra quando houver infra de fila/DB (Fase 5+).
_executor = ThreadPoolExecutor(max_workers=2)


class JobStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    DONE = "done"
    ERROR = "error"


class Job(BaseModel):
    id: str
    status: JobStatus
    result: dict[str, Any] | None = None
    error: str | None = None


_jobs: dict[str, Job] = {}
_job_events: dict[str, asyncio.Event] = {}


def _run_analysis_sync(job_id: str, raw_bytes: bytes) -> None:
    try:
        audio, sample_rate = decode_audio_to_mono(raw_bytes)
        result = analyze(audio, sample_rate)
        _jobs[job_id] = Job(
            id=job_id,
            status=JobStatus.DONE,
            result={
                "chordSegments": [
                    {
                        "chord": seg.chord,
                        "onset": seg.onset,
                        "offset": seg.offset,
                        "confidence": seg.confidence,
                    }
                    for seg in result.chord_segments
                ],
                "key": result.key,
                "keyScale": result.key_scale,
                "keyConfidence": result.key_confidence,
                "bpm": result.bpm,
                "beatGrid": result.beat_times,
            },
        )
    except Exception as exc:  # noqa: BLE001 — reportar qualquer falha ao client
        _jobs[job_id] = Job(id=job_id, status=JobStatus.ERROR, error=str(exc))
    finally:
        _job_events[job_id].set()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "analysis-service"}


@app.post("/analyze")
async def create_analysis_job(file: UploadFile) -> dict[str, str]:
    raw_bytes = await file.read()
    job_id = str(uuid.uuid4())
    _jobs[job_id] = Job(id=job_id, status=JobStatus.PROCESSING)
    _job_events[job_id] = asyncio.Event()

    loop = asyncio.get_running_loop()
    loop.run_in_executor(_executor, _run_analysis_sync, job_id, raw_bytes)

    return {"job_id": job_id}


@app.get("/jobs/{job_id}")
def get_job(job_id: str) -> Job:
    job = _jobs.get(job_id)
    if job is None:
        return Job(id=job_id, status=JobStatus.ERROR, error="job não encontrado")
    return job


@app.websocket("/ws/jobs/{job_id}")
async def job_progress(websocket: WebSocket, job_id: str) -> None:
    await websocket.accept()
    event = _job_events.get(job_id)

    if event is None:
        await websocket.send_json({"status": "error", "error": "job não encontrado"})
        await websocket.close()
        return

    try:
        await asyncio.wait_for(event.wait(), timeout=120)
    except TimeoutError:
        await websocket.send_json({"status": "error", "error": "tempo limite da análise excedido"})
        await websocket.close()
        return

    job = _jobs[job_id]
    try:
        await websocket.send_json(job.model_dump())
    except WebSocketDisconnect:
        pass
    finally:
        await websocket.close()
