import type { Request, Response } from "express";
import {
  createTrackWithAnalysis,
  deleteTrack,
  findTrackById,
  getLatestAnalysis,
  listTracksByOwner,
  renameTrack,
  type ChordEventInput,
} from "../tracks/trackRepository.js";
import { deleteAudioFile, readAudioFile, saveAudioFile } from "../storage/localStorage.js";

function toPublicTrack(track: {
  id: string;
  title: string;
  duration_sec: number;
  original_format: string;
  uploaded_at: Date;
  visibility: string;
}) {
  return {
    id: track.id,
    title: track.title,
    durationSec: track.duration_sec,
    originalFormat: track.original_format,
    uploadedAt: track.uploaded_at,
    visibility: track.visibility,
  };
}

export async function saveTrack(req: Request, res: Response): Promise<void> {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Nenhum arquivo de áudio enviado" });
    return;
  }

  const body = req.body as {
    title?: string;
    durationSec?: string;
    chordSegments?: string;
    key?: string;
    keyScale?: string;
    bpm?: string;
    beatGrid?: string;
  };

  if (!body.title || !body.durationSec) {
    res.status(400).json({ error: "title e durationSec são obrigatórios" });
    return;
  }

  const ownerId = req.user!.sub;
  const storagePath = await saveAudioFile(ownerId, file.originalname, file.buffer);

  let chordEvents: ChordEventInput[] = [];
  try {
    chordEvents = body.chordSegments ? JSON.parse(body.chordSegments) : [];
  } catch {
    res.status(400).json({ error: "chordSegments precisa ser um JSON válido" });
    return;
  }

  const track = await createTrackWithAnalysis({
    ownerId,
    title: body.title,
    storagePath,
    durationSec: Number(body.durationSec),
    originalFormat: file.mimetype,
    modelVersion: "tier2-essentia-v1",
    chordEvents,
    key: body.key ?? null,
    keyScale: body.keyScale ?? null,
    keyConfidence: null,
    bpm: body.bpm ? Number(body.bpm) : null,
    beatGrid: body.beatGrid ? JSON.parse(body.beatGrid) : [],
  });

  res.status(201).json(toPublicTrack(track));
}

export async function listTracks(req: Request, res: Response): Promise<void> {
  const tracks = await listTracksByOwner(req.user!.sub);
  res.json(tracks.map(toPublicTrack));
}

export async function getTrack(req: Request, res: Response): Promise<void> {
  const track = await findTrackById(req.params.id);
  if (!track || track.owner_id !== req.user!.sub) {
    res.status(404).json({ error: "Faixa não encontrada" });
    return;
  }

  const analysis = await getLatestAnalysis(track.id);
  res.json({ ...toPublicTrack(track), analysis });
}

export async function getTrackAudio(req: Request, res: Response): Promise<void> {
  const track = await findTrackById(req.params.id);
  if (!track || track.owner_id !== req.user!.sub) {
    res.status(404).json({ error: "Faixa não encontrada" });
    return;
  }

  const buffer = await readAudioFile(track.storage_path);
  res.setHeader("Content-Type", track.original_format);
  res.send(buffer);
}

export async function patchTrack(req: Request, res: Response): Promise<void> {
  const { title } = req.body as { title?: string };
  if (!title || title.trim().length === 0) {
    res.status(400).json({ error: "title é obrigatório" });
    return;
  }

  const track = await renameTrack(req.params.id, req.user!.sub, title.trim());
  if (!track) {
    res.status(404).json({ error: "Faixa não encontrada" });
    return;
  }
  res.json(toPublicTrack(track));
}

export async function removeTrack(req: Request, res: Response): Promise<void> {
  const track = await deleteTrack(req.params.id, req.user!.sub);
  if (!track) {
    res.status(404).json({ error: "Faixa não encontrada" });
    return;
  }
  await deleteAudioFile(track.storage_path);
  res.status(204).send();
}
