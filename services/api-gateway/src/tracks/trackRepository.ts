import { pool } from "../db/pool.js";

export interface Track {
  id: string;
  owner_id: string;
  title: string;
  storage_path: string;
  duration_sec: number;
  original_format: string;
  uploaded_at: Date;
  visibility: string;
}

export interface ChordEventInput {
  chord: string;
  onset: number;
  offset: number;
  confidence?: number;
}

export interface SaveTrackInput {
  ownerId: string;
  title: string;
  storagePath: string;
  durationSec: number;
  originalFormat: string;
  modelVersion: string;
  chordEvents: ChordEventInput[];
  key: string | null;
  keyScale: string | null;
  keyConfidence: number | null;
  bpm: number | null;
  beatGrid: number[];
}

export async function createTrackWithAnalysis(input: SaveTrackInput): Promise<Track> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const trackResult = await client.query<Track>(
      `INSERT INTO tracks (owner_id, title, storage_path, duration_sec, original_format)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [input.ownerId, input.title, input.storagePath, input.durationSec, input.originalFormat],
    );
    const track = trackResult.rows[0];

    const analysisResult = await client.query<{ id: string }>(
      `INSERT INTO analyses (track_id, model_version, status) VALUES ($1, $2, 'done') RETURNING id`,
      [track.id, input.modelVersion],
    );
    const analysisId = analysisResult.rows[0].id;

    for (const chord of input.chordEvents) {
      await client.query(
        `INSERT INTO chord_events (analysis_id, chord_symbol, onset_sec, offset_sec, confidence)
         VALUES ($1, $2, $3, $4, $5)`,
        [analysisId, chord.chord, chord.onset, chord.offset, chord.confidence ?? 1.0],
      );
    }

    if (input.key) {
      await client.query(
        `INSERT INTO key_segments (analysis_id, key_name, scale, confidence)
         VALUES ($1, $2, $3, $4)`,
        [analysisId, input.key, input.keyScale, input.keyConfidence ?? 1.0],
      );
    }

    await client.query(
      `INSERT INTO tempo_profiles (analysis_id, bpm, beat_grid) VALUES ($1, $2, $3)`,
      [analysisId, input.bpm, JSON.stringify(input.beatGrid)],
    );

    await client.query("COMMIT");
    return track;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listTracksByOwner(ownerId: string): Promise<Track[]> {
  const result = await pool.query<Track>(
    "SELECT * FROM tracks WHERE owner_id = $1 ORDER BY uploaded_at DESC",
    [ownerId],
  );
  return result.rows;
}

export async function findTrackById(id: string): Promise<Track | null> {
  const result = await pool.query<Track>("SELECT * FROM tracks WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function renameTrack(id: string, ownerId: string, title: string): Promise<Track | null> {
  const result = await pool.query<Track>(
    "UPDATE tracks SET title = $1 WHERE id = $2 AND owner_id = $3 RETURNING *",
    [title, id, ownerId],
  );
  return result.rows[0] ?? null;
}

export async function deleteTrack(id: string, ownerId: string): Promise<Track | null> {
  const result = await pool.query<Track>(
    "DELETE FROM tracks WHERE id = $1 AND owner_id = $2 RETURNING *",
    [id, ownerId],
  );
  return result.rows[0] ?? null;
}

export interface FullAnalysis {
  chordSegments: { chord: string; onset: number; offset: number; confidence: number }[];
  key: string | null;
  keyScale: string | null;
  bpm: number | null;
  beatGrid: number[];
}

export async function getLatestAnalysis(trackId: string): Promise<FullAnalysis | null> {
  const analysisResult = await pool.query<{ id: string }>(
    "SELECT id FROM analyses WHERE track_id = $1 ORDER BY completed_at DESC LIMIT 1",
    [trackId],
  );
  const analysisId = analysisResult.rows[0]?.id;
  if (!analysisId) return null;

  const [chords, key, tempo] = await Promise.all([
    pool.query<{ chord_symbol: string; onset_sec: number; offset_sec: number; confidence: number }>(
      "SELECT chord_symbol, onset_sec, offset_sec, confidence FROM chord_events WHERE analysis_id = $1 ORDER BY onset_sec",
      [analysisId],
    ),
    pool.query<{ key_name: string; scale: string | null }>(
      "SELECT key_name, scale FROM key_segments WHERE analysis_id = $1 LIMIT 1",
      [analysisId],
    ),
    pool.query<{ bpm: number | null; beat_grid: number[] }>(
      "SELECT bpm, beat_grid FROM tempo_profiles WHERE analysis_id = $1 LIMIT 1",
      [analysisId],
    ),
  ]);

  return {
    chordSegments: chords.rows.map((r) => ({
      chord: r.chord_symbol,
      onset: r.onset_sec,
      offset: r.offset_sec,
      confidence: r.confidence,
    })),
    key: key.rows[0]?.key_name ?? null,
    keyScale: key.rows[0]?.scale ?? null,
    bpm: tempo.rows[0]?.bpm ?? null,
    beatGrid: tempo.rows[0]?.beat_grid ?? [],
  };
}
