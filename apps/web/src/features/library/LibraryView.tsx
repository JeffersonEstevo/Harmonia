import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import { usePlayerStore } from "../../stores/playerStore";
import {
  deleteSavedTrack,
  getSavedTrack,
  getSavedTrackAudio,
  listSavedTracks,
  renameSavedTrack,
  type SavedTrackSummary,
} from "../../lib/apiClient";
import "./LibraryView.css";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface Props {
  /** chamado depois que uma faixa é aberta, pra o App voltar pra tela do player */
  onTrackOpened: () => void;
}

export function LibraryView({ onTrackOpened }: Props) {
  const token = useAuthStore((s) => s.token);
  const loadSavedTrack = usePlayerStore((s) => s.loadSavedTrack);

  const [tracks, setTracks] = useState<SavedTrackSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setTracks(await listSavedTracks(token));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!token) return null;

  const handleOpen = async (track: SavedTrackSummary) => {
    setBusyId(track.id);
    try {
      const [detail, file] = await Promise.all([
        getSavedTrack(token, track.id),
        getSavedTrackAudio(token, track.id, track.title),
      ]);
      await loadSavedTrack(
        file,
        {
          chordSegments: (detail.analysis?.chordSegments ?? []).map((c) => ({
            chord: c.chord,
            onset: c.onset,
            offset: c.offset,
          })),
          bpm: detail.analysis?.bpm ?? null,
          beatGrid: detail.analysis?.beatGrid ?? [],
          key: detail.analysis?.key ?? null,
          keyScale: detail.analysis?.keyScale ?? null,
        },
        track.id,
      );
      onTrackOpened();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleRename = async (id: string) => {
    const title = editingTitle.trim();
    setEditingId(null);
    if (!title) return;
    try {
      await renameSavedTrack(token, id, title);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (track: SavedTrackSummary) => {
    if (!window.confirm(`Apagar "${track.title}" da biblioteca? Isso não pode ser desfeito.`)) {
      return;
    }
    setBusyId(track.id);
    try {
      await deleteSavedTrack(token, track.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="library">
      <h2 className="library__title">Minha biblioteca</h2>

      {error && (
        <p className="library__error" role="alert">
          {error}
        </p>
      )}

      {tracks === null && !error && <p className="library__empty">Carregando…</p>}

      {tracks !== null && tracks.length === 0 && (
        <p className="library__empty">
          Nada salvo ainda. Carregue uma faixa e use "Salvar na biblioteca".
        </p>
      )}

      {tracks !== null && tracks.length > 0 && (
        <ul className="library__list">
          {tracks.map((track) => (
            <li key={track.id} className="library__item">
              <div className="library__info">
                {editingId === track.id ? (
                  <input
                    className="library__rename-input"
                    value={editingTitle}
                    autoFocus
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={() => void handleRename(track.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleRename(track.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                ) : (
                  <span className="library__name">{track.title}</span>
                )}
                <span className="library__meta">
                  {formatDuration(track.durationSec)} · {formatDate(track.uploadedAt)}
                </span>
              </div>

              <div className="library__actions">
                <button
                  type="button"
                  onClick={() => void handleOpen(track)}
                  disabled={busyId === track.id}
                >
                  {busyId === track.id ? "…" : "Abrir"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(track.id);
                    setEditingTitle(track.title);
                  }}
                >
                  Renomear
                </button>
                <button
                  type="button"
                  className="library__delete"
                  onClick={() => void handleDelete(track)}
                  disabled={busyId === track.id}
                >
                  Apagar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
