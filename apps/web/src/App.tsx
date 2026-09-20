import { useEffect, useState } from "react";
import { usePlayerStore } from "./stores/playerStore";
import { UploadZone } from "./features/upload/UploadZone";
import { WaveformCanvas } from "./features/waveform/WaveformCanvas";
import { TransportControls } from "./features/transport/TransportControls";
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

function App() {
  const status = usePlayerStore((s) => s.status);
  const fileName = usePlayerStore((s) => s.fileName);
  const isReady = status === "ready";

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
            <WaveformCanvas />
            <TransportControls />
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
