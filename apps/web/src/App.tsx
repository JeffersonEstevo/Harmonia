import { useEffect, useState } from "react";
import { fetchHealth, type HealthResponse } from "./lib/apiClient";
import "./App.css";

/**
 * Shell mínimo do app — Fase 0.
 * Objetivo único aqui: provar que apps/web consegue falar com services/api-gateway.
 * A UI real (upload, waveform, overlays) entra nas Fases 1–3, conforme docs/PROGRESS.md.
 */
function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <main className="app-shell">
      <h1>Harmonia</h1>
      <p>Fase 0 — Setup do Projeto</p>

      <section className="status-card">
        <h2>Status do API Gateway</h2>
        {health && (
          <p>
            ✅ {health.service} v{health.version} — {health.status}
          </p>
        )}
        {error && (
          <p>
            ⚠️ Não foi possível falar com o gateway ({error}). Rode{" "}
            <code>make dev</code> ou <code>docker compose up</code> na raiz
            do projeto para subir o serviço.
          </p>
        )}
        {!health && !error && <p>Verificando...</p>}
      </section>
    </main>
  );
}

export default App;
