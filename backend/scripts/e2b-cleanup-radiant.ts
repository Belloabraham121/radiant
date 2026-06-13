import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { killRadiantSandboxes } from "../src/services/sandbox/e2b-cleanup.service.js";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../.env") });

async function main() {
  const result = await killRadiantSandboxes();
  console.log(`Killed ${result.killed.length} radiant sandbox(es).`);
  if (result.killed.length > 0) {
    console.log(result.killed.join("\n"));
  }
  if (result.failed.length > 0) {
    console.error("Failed to kill:", result.failed);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
