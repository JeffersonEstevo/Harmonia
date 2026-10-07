import { createApp } from "./app.js";
import { config } from "./config/index.js";
import { runMigrations } from "./db/migrate.js";

async function main() {
  await runMigrations();

  const app = createApp();
  app.listen(config.port, () => {
    console.info(`[api-gateway] rodando em http://localhost:${config.port} (${config.nodeEnv})`);
  });
}

main().catch((err) => {
  console.error("[api-gateway] falha ao iniciar:", err);
  process.exit(1);
});
