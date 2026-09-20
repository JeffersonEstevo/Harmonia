import { createApp } from "./app.js";
import { config } from "./config/index.js";

const app = createApp();

app.listen(config.port, () => {
  console.info(`[api-gateway] rodando em http://localhost:${config.port} (${config.nodeEnv})`);
});
