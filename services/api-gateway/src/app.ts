import express from "express";
import cors from "cors";
import { config } from "./config/index.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { tracksRouter } from "./routes/tracks.js";
import { sharedRouter } from "./routes/shared.js";

/**
 * Exportado separado de index.ts para poder ser importado nos testes
 * sem precisar subir um listener de porta real (supertest usa isso direto).
 */
export function createApp() {
  const app = express();

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json());

  app.use(healthRouter);
  app.use("/api", authRouter);
  app.use("/api", sharedRouter);
  app.use("/api", tracksRouter);

  return app;
}
