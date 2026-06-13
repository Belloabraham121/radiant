import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sweepRadiantSandboxes } from "../src/services/sandbox/e2b-cleanup.service.js";
import { logger } from "../src/shared/logger.js";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../.env") });

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

function parseIntervalMs(): number {
  const raw = process.env.E2B_CLEANUP_INTERVAL_MS;
  if (!raw) return DEFAULT_INTERVAL_MS;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 60_000 ? value : DEFAULT_INTERVAL_MS;
}

async function runSweep(label: string) {
  const result = await sweepRadiantSandboxes();
  logger.info(`E2B cleanup sweep (${label})`, {
    running_killed: result.running.killed.length,
    running_failed: result.running.failed.length,
    paused_killed: result.paused.killed.length,
    paused_failed: result.paused.failed.length,
  });

  if (result.running.failed.length > 0 || result.paused.failed.length > 0) {
    logger.error("E2B cleanup sweep had failures", {
      running_failed: result.running.failed,
      paused_failed: result.paused.failed,
    });
  }
}

async function main() {
  const once = process.env.E2B_CLEANUP_ONCE === "true";
  const intervalMs = parseIntervalMs();

  await runSweep(once ? "once" : "initial");

  if (once) {
    return;
  }

  logger.info("E2B cleanup cron started", { interval_ms: intervalMs });
  setInterval(() => {
    void runSweep("interval");
  }, intervalMs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
