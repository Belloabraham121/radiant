import { createServer } from "node:http";
import { createApp } from "./app.js";
import { getCorsEnv, getServerEnv } from "./config/env.js";
import { prisma } from "./infrastructure/postgres/client.js";
import { logger } from "./shared/logger.js";

const app = createApp();
const { port, nodeEnv } = getServerEnv();

function registerProcessHandlers(): void {
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception", { message: err.message, stack: err.stack });
    process.exit(1);
  });
}

registerProcessHandlers();

async function start() {
  await prisma.$connect();
  logger.info("Database connected");

  const httpServer = createServer(app);

  const server = httpServer.listen(port, () => {
    const { corsOrigin } = getCorsEnv();
    logger.info("Server started", {
      port,
      nodeEnv,
      logLevel: logger.level,
      corsOrigin,
      routes: [
        "GET /health",
        "GET /api/v1/version",
        "GET /api/v1/auth/me",
        "POST /api/v1/auth/register-wallet",
        "POST /api/v1/auth/logout",
        "GET /api/v1/wallets/balances",
      ],
    });
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      logger.error("Port already in use", {
        port,
        hint: `Stop the other process or set PORT in .env`,
      });
      process.exit(1);
    }
    logger.error("Server failed to start", { message: err.message, stack: err.stack });
    throw err;
  });
}

start().catch((err) => {
  logger.error("Startup failed", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
