import { useState } from "react";
import { usePlayerStore } from "../../stores/playerStore";
import { useAuthStore } from "../../stores/authStore";
import { saveTrackToLibrary } from "../../lib/apiClient";

/**
 * Salva a faixa atual (áudio + análise exibida) na biblioteca do usuário.
 * Só aparece logado; some/vira "Salva ✓" depois de salvar.
 */
export function SaveTrackButton() {
  const token = useAuthStore((s) => s.token);
  const currentFile = usePlayerStore((s) => s.currentFile);
  const savedTrackId = usePlayerStore((s) => s.savedTrackId);
  const fileName = usePlayerStore((s) => s.fileName);
  const duration = usePlayerStore((s) => s.duration);
  const chordSegments = usePlayerStore((s) => s.chordSegments);
  const musicalKey = usePlayerStore((s) => s.musicalKey);
  const keyScale = usePlayerStore((s) => s.keyScale);
  const bpm = usePlayerStore((s) => s.bpm);
  const beatGrid = usePlayerStore((s) => s.beatGrid);
  const tier2Status = usePlayerStore((s) => s.tier2Status);
  const markSaved = usePlayerStore((s) => s.markSaved);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return <span className="save-track__hint">Entre na sua conta pra salvar esta faixa</span>;
  }
  if (savedTrackId) {
    return <span className="save-track__saved">Salva na biblioteca ✓</span>;
  }

  const handleSave = async () => {
    if (!currentFile || !fileName) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveTrackToLibrary(token, currentFile, {
        title: fileName.replace(/\.[^.]+$/, ""),
        durationSec: duration,
        chordSegments: chordSegments.map((c) => ({
          chord: c.chord,
          onset: c.onset,
          offset: c.offset,
        })),
        key: musicalKey,
        keyScale,
        bpm,
        beatGrid,
      });
      markSaved(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <span className="save-track">
      <button
        type="button"
        className="track-view__new-button"
        onClick={handleSave}
        disabled={saving}
        title={
          tier2Status === "analyzing"
            ? "A análise precisa do servidor ainda está em andamento — salvar agora guarda o resultado preliminar"
            : undefined
        }
      >
        {saving ? "Salvando…" : "Salvar na biblioteca"}
      </button>
      {error && <span className="save-track__error"> {error}</span>}
    </span>
  );
}
