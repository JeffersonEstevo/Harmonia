import { useEffect, useState } from "react";
import { usePlayerStore } from "./stores/playerStore";
import { UploadZone } from "./features/upload/UploadZone";
import { WaveformCanvas } from "./features/waveform/WaveformCanvas";
import { TransportControls } from "./features/transport/TransportControls";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { fetchHealth } from "./lib/apiClient";
import "./App.css";

function GatewayStatusBadge() {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    fetchHealth()
      .then(() => setOk(true))
      .catch(() => setOk(false));
  }, []);

  if (ok === null) return null;
  return (
    <span className={`gateway-badge ${ok ? "gateway-badge--ok" : "gateway-badge--down"}`}>
      {ok ? "gateway conectado" : "gateway offline"}
    </span>
  );
}

function AnalysisStatusLine() {
  const analysisStatus = usePlayerStore((s) => s.analysisStatus);
  const analysisError = usePlayerStore((s) => s.analysisError);
  const bpm = usePlayerStore((s) => s.bpm);
  const chordSegments = usePlayerStore((s) => s.chordSegments);

  if (analysisStatus === "analyzing") {
    return <span className="analysis-status analysis-status--busy">Analisando acordes e tempo…</span>;
  }
  if (analysisStatus === "error") {
    return (
      <span className="analysis-status">
        Análise indisponível para esta faixa{analysisError ? ` (${analysisError})` : ""}.
      </span>
    );
  }
  if (analysisStatus === "done") {
    const bpmLabel = bpm ? `${bpm} BPM` : "BPM não detectado";
    return (
      <span className="analysis-status">
        {bpmLabel} · {chordSegments.length} acorde{chordSegments.length === 1 ? "" : "s"} detectado
        {chordSegments.length === 1 ? "" : "s"}
      </span>
    );
  }
  return null;
}

function App() {
  const status = usePlayerStore((s) => s.status);
  const fileName = usePlayerStore((s) => s.fileName);
  const isReady = status === "ready";

  useKeyboardShortcuts(isReady);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-header__title">Harmonia</h1>
        <GatewayStatusBadge />
      </header>

      <main className="app-main">
        {!isReady && <UploadZone />}

        {isReady && (
          <section className="track-view">
            <p className="track-view__filename">{fileName}</p>
            <AnalysisStatusLine />
            <WaveformCanvas />
            <TransportControls />
            <p className="track-view__hint">
              Espaço/K reproduz · J/L pula ±5s · Shift+arraste cria um loop · I/O define
              início/fim do loop no playhead · +/- dá zoom
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
