import { randomBytes } from "node:crypto";
import { pool } from "../db/pool.js";

export interface ShareLink {
  id: string;
  track_id: string;
  token: string;
  visibility: string;
  expires_at: Date | null;
  allow_audio: boolean;
  peaks: number[] | null;
  created_at: Date;
}

/** 24 bytes aleatórios do CSPRNG = 192 bits — inviável de adivinhar. */
function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function createShareLink(input: {
  trackId: string;
  allowAudio: boolean;
  expiresAt: Date | null;
  peaks: number[] | null;
}): Promise<ShareLink> {
  const result = await pool.query<ShareLink>(
    `INSERT INTO share_links (track_id, token, visibility, expires_at, allow_audio, peaks)
     VALUES ($1, $2, 'unlisted', $3, $4, $5) RETURNING *`,
    [
      input.trackId,
      newToken(),
      input.expiresAt,
      input.allowAudio,
      input.peaks ? JSON.stringify(input.peaks) : null,
    ],
  );
  return result.rows[0];
}

export async function listShareLinks(trackId: string): Promise<ShareLink[]> {
  const result = await pool.query<ShareLink>(
    "SELECT * FROM share_links WHERE track_id = $1 ORDER BY created_at DESC",
    [trackId],
  );
  return result.rows;
}

export async function deleteShareLink(id: string, trackId: string): Promise<boolean> {
  const result = await pool.query("DELETE FROM share_links WHERE id = $1 AND track_id = $2", [
    id,
    trackId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

/** Só devolve links não expirados — desconhecido e expirado são indistinguíveis pra quem consulta. */
export async function findActiveShareByToken(token: string): Promise<ShareLink | null> {
  const result = await pool.query<ShareLink>(
    "SELECT * FROM share_links WHERE token = $1 AND (expires_at IS NULL OR expires_at > now())",
    [token],
  );
  return result.rows[0] ?? null;
}
