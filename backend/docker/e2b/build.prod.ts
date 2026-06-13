import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Template, defaultBuildLogger } from "e2b";
import { template } from "./template.ts";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../.env") });

process.chdir(here);

const TEMPLATE_ALIAS = process.env.E2B_TEMPLATE_ALIAS ?? "radiant-build:v1";

async function main() {
  console.log(`Building E2B template ${TEMPLATE_ALIAS}...`);
  const info = await Template.build(template, TEMPLATE_ALIAS, {
    cpuCount: 2,
    memoryMB: 4096,
    onBuildLogs: defaultBuildLogger(),
  });
  console.log("Template build complete:", info);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
