import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(","),
  // versão do serviço, usada na resposta do /health — bater com package.json manualmente
  // por enquanto; automatizar via build step quando o pipeline de CI existir (Fase 4+).
  version: "0.0.0",

  // --- Fase 5: Auth & Persistência ---
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/harmonia",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-troque-em-producao",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  // storage local em disco por ora — ver docs/DECISIONS.md (sem S3 ainda)
  storageDir: process.env.STORAGE_DIR ?? "/app/storage",

  // Google OAuth — sem essas três variáveis configuradas, as rotas
  // /api/auth/google* respondem 501 em vez de quebrar (ver auth routes)
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? null,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? null,
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:4000/api/auth/google/callback",
} as const;
