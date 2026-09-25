import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { prisma } from "./lib/prisma.js";

const app = createApp();

const server = app.listen(config.PORT, () => {
  process.stdout.write(`API listening on port ${config.PORT}\n`);
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  process.stdout.write(`Received ${signal}, shutting down...\n`);

  server.close(async (error) => {
    if (error) {
      process.stderr.write(`Error while closing HTTP server: ${String(error)}\n`);
      process.exit(1);
      return;
    }

    await prisma.$disconnect();
    process.exit(0);
  });

  setTimeout(() => {
    process.stderr.write("Forced shutdown after timeout.\n");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
