import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(","),
  // versão do serviço, usada na resposta do /health — bater com package.json manualmente
  // por enquanto; automatizar via build step quando o pipeline de CI existir (Fase 4+).
  version: "0.0.0",
} as const;
