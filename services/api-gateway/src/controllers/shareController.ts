import type { Request, Response } from "express";
import { findTrackById, getLatestAnalysis } from "../tracks/trackRepository.js";
import {
  createShareLink,
  deleteShareLink,
  findActiveShareByToken,
  listShareLinks,
  type ShareLink,
} from "../shares/shareRepository.js";
import { readAudioFile } from "../storage/localStorage.js";
import { sendAudio } from "./trackController.js";

const MAX_PEAK_VALUES = 4000; // ~2000 buckets (min/max) — bem mais que os ~1000 que o client manda
const MAX_EXPIRES_DAYS = 365;

function toPublicShare(link: ShareLink) {
  return {
    id: link.id,
    token: link.token,
    allowAudio: link.allow_audio,
    expiresAt: link.expires_at,
    createdAt: link.created_at,
  };
}

/** Peaks vêm do cliente e viram dado público: valida tipo, tamanho e faixa de valores. */
function parsePeaks(value: unknown): number[] | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PEAK_VALUES) {
    return "invalid";
  }
  if (value.length % 2 !== 0) return "invalid"; // pares [min, max]
  for (const v of value) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < -1.01 || v > 1.01) return "invalid";
  }
  return value as number[];
}

/** Dono da faixa ou null — 404 uniforme, sem revelar faixas alheias. */
async function loadOwnedTrack(req: Request, res: Response) {
  const track = await findTrackById(req.params.id);
  if (!track || track.owner_id !== req.user!.sub) {
    res.status(404).json({ error: "Faixa não encontrada" });
    return null;
  }
  return track;
}

export async function createShare(req: Request, res: Response): Promise<void> {
  const track = await loadOwnedTrack(req, res);
  if (!track) return;

  const body = (req.body ?? {}) as {
    allowAudio?: unknown;
    expiresInDays?: unknown;
    peaks?: unknown;
  };

  if (body.allowAudio !== undefined && typeof body.allowAudio !== "boolean") {
    res.status(400).json({ error: "allowAudio precisa ser booleano" });
    return;
  }

  let expiresAt: Date | null = null;
  if (body.expiresInDays !== undefined && body.expiresInDays !== null) {
    const days = body.expiresInDays;
    if (typeof days !== "number" || !Number.isFinite(days) || days <= 0 || days > MAX_EXPIRES_DAYS) {
      res.status(400).json({ error: `expiresInDays deve estar entre 1 e ${MAX_EXPIRES_DAYS}` });
      return;
    }
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  const peaks = parsePeaks(body.peaks);
  if (peaks === "invalid") {
    res.status(400).json({ error: "peaks inválido (pares [min,max] entre -1 e 1, até 4000 valores)" });
    return;
  }

  const link = await createShareLink({
    trackId: track.id,
    allowAudio: body.allowAudio ?? false,
    expiresAt,
    peaks,
  });
  res.status(201).json(toPublicShare(link));
}

export async function listShares(req: Request, res: Response): Promise<void> {
  const track = await loadOwnedTrack(req, res);
  if (!track) return;
  res.json((await listShareLinks(track.id)).map(toPublicShare));
}

export async function revokeShare(req: Request, res: Response): Promise<void> {
  const track = await loadOwnedTrack(req, res);
  if (!track) return;

  const removed = await deleteShareLink(req.params.shareId, track.id);
  if (!removed) {
    res.status(404).json({ error: "Link não encontrado" });
    return;
  }
  res.status(204).send();
}

// ---------------------------------------------------------------------
// Rotas PÚBLICAS (sem login) — o token é a única credencial
// ---------------------------------------------------------------------

export async function getSharedTrack(req: Request, res: Response): Promise<void> {
  const link = await findActiveShareByToken(req.params.token);
  const track = link ? await findTrackById(link.track_id) : null;
  if (!link || !track) {
    res.status(404).json({ error: "Link não encontrado ou expirado" });
    return;
  }

  const analysis = await getLatestAnalysis(track.id);

  // Resposta montada campo a campo: nada de storage_path, owner_id, e-mail
  // do dono ou formato interno vaza por aqui.
  res.setHeader("Referrer-Policy", "no-referrer");
  res.json({
    title: track.title,
    durationSec: track.duration_sec,
    allowAudio: link.allow_audio,
    expiresAt: link.expires_at,
    peaks: link.peaks,
    analysis,
  });
}

export async function getSharedAudio(req: Request, res: Response): Promise<void> {
  const link = await findActiveShareByToken(req.params.token);
  const track = link ? await findTrackById(link.track_id) : null;
  if (!link || !track) {
    res.status(404).json({ error: "Link não encontrado ou expirado" });
    return;
  }

  if (!link.allow_audio) {
    res.status(403).json({ error: "O dono deste link não permitiu ouvir o áudio" });
    return;
  }

  res.setHeader("Referrer-Policy", "no-referrer");
  sendAudio(res, track.original_format, await readAudioFile(track.storage_path));
}
