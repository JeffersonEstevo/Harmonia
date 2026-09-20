import express from "express";
import cors from "cors";
import { config } from "./config/index.js";
import { healthRouter } from "./routes/health.js";

/**
 * Exportado separado de index.ts para poder ser importado nos testes
 * sem precisar subir um listener de porta real (supertest usa isso direto).
 */
export function createApp() {
  const app = express();

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json());

  app.use(healthRouter);

  // outras rotas de domínio (tracks, analysis, share) entram na Fase 4,
  // quando o upload/análise forem implementados — ver docs/PROGRESS.md
  // e docs/SPEC.md §6.6 para o contrato completo de API planejado.

  return app;
}
