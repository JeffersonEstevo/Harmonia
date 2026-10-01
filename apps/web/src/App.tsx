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
  const tier2Status = usePlayerStore((s) => s.tier2Status);
  const tier2Error = usePlayerStore((s) => s.tier2Error);
  const bpm = usePlayerStore((s) => s.bpm);
  const chordSegments = usePlayerStore((s) => s.chordSegments);
  const musicalKey = usePlayerStore((s) => s.musicalKey);
  const keyScale = usePlayerStore((s) => s.keyScale);

  // Prioriza mostrar QUALQUER resultado disponível (Nível 1 ou Camada 2),
  // não o status de uma camada específica — antes, se o Nível 1 falhasse
  // (client-side, mais frágil) a tela mostrava "indisponível" mesmo quando
  // a Camada 2 (servidor) já tinha entregue um resultado bem melhor.
  const hasResult = analysisStatus === "done" || tier2Status === "done";
  const stillWorking =
    !hasResult && (analysisStatus === "analyzing" || tier2Status === "analyzing");
  const bothFailed =
    !hasResult &&
    !stillWorking &&
    analysisStatus === "error" &&
    (tier2Status === "error" || tier2Status === "idle");

  if (stillWorking) {
    return <span className="analysis-status analysis-status--busy">Analisando acordes e tempo…</span>;
  }

  if (bothFailed) {
    const detail = tier2Error ?? analysisError;
    return (
      <span className="analysis-status">
        Análise indisponível para esta faixa{detail ? ` (${detail})` : ""}.
      </span>
    );
  }

  if (hasResult) {
    const bpmLabel = bpm ? `${Math.round(bpm)} BPM` : "BPM não detectado";
    const keyLabel = musicalKey ? ` · ${musicalKey}${keyScale === "minor" ? "m" : ""}` : "";
    const chordCount = `${chordSegments.length} acorde${chordSegments.length === 1 ? "" : "s"}`;

    return (
      <span className="analysis-status">
        {bpmLabel}
        {keyLabel} · {chordCount}
        {tier2Status === "analyzing" && (
          <span className="analysis-status--busy"> · refinando com o servidor…</span>
        )}
        {tier2Status === "error" && <span> · refinamento do servidor indisponível</span>}
        {tier2Status === "done" && <span className="analysis-status--refined"> · refinado</span>}
      </span>
    );
  }
  return null;
}

function App() {
  const status = usePlayerStore((s) => s.status);
  const fileName = usePlayerStore((s) => s.fileName);
  const reset = usePlayerStore((s) => s.reset);
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
            <div className="track-view__header">
              <p className="track-view__filename">{fileName}</p>
              <button type="button" className="track-view__new-button" onClick={reset}>
                Nova faixa
              </button>
            </div>
            <AnalysisStatusLine />
            <WaveformCanvas />
            <TransportControls />
            <p className="track-view__hint">
              Espaço/K reproduz · J/L pula ±5s · Shift+arraste cria um loop · I/O define
              início/fim do loop no playhead · +/- dá zoom · "Seguir cursor" recentraliza o
              zoom durante a reprodução
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
