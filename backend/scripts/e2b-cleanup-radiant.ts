import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sweepRadiantSandboxes } from "../src/services/sandbox/e2b-cleanup.service.js";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../.env") });

async function main() {
  const result = await sweepRadiantSandboxes();
  console.log(
    `Killed ${result.running.killed.length} running and ${result.paused.killed.length} paused radiant sandbox(es).`,
  );
  if (result.running.killed.length > 0) {
    console.log("Running:", result.running.killed.join("\n"));
  }
  if (result.paused.killed.length > 0) {
    console.log("Paused:", result.paused.killed.join("\n"));
  }
  const failed = [...result.running.failed, ...result.paused.failed];
  if (failed.length > 0) {
    console.error("Failed to kill:", failed);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
