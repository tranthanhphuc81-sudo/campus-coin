import { createApp } from "./app.js";
import { config } from "./config/env.js";

const app = createApp();

app.listen(config.PORT, () => {
  process.stdout.write(`API listening on port ${config.PORT}\n`);
});
