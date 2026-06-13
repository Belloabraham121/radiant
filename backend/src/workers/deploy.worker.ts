import { killStaleRadiantSandboxesOnBoot } from "../services/sandbox/e2b-cleanup.service.js";
import { startDeployWorker } from "../infrastructure/redis/queues.js";
import { logger } from "../shared/logger.js";

async function main() {
  const cleanup = await killStaleRadiantSandboxesOnBoot();
  if (cleanup) {
    logger.info("E2B stale sandbox cleanup on worker boot", {
      killed: cleanup.killed.length,
      failed: cleanup.failed.length,
    });
  }

  const worker = startDeployWorker();
  if (!worker) {
    logger.error("Deploy worker requires REDIS_URL — BullMQ queue not available");
    process.exit(1);
  }

  logger.info("Deploy worker started", {
    queue: "radiant:deploy",
  });
}

main().catch((err) => {
  logger.error("Deploy worker failed to start", {
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
