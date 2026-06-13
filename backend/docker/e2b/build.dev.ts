import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Template, defaultBuildLogger } from "e2b";
import { template } from "./template.ts";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../.env") });

process.chdir(here);

const TEMPLATE_ALIAS = process.env.E2B_TEMPLATE_DEV_ALIAS ?? "radiant-build:dev";

async function main() {
  console.log(`Building E2B dev template ${TEMPLATE_ALIAS}...`);
  const info = await Template.build(template, TEMPLATE_ALIAS, {
    cpuCount: 1,
    memoryMB: 2048,
    onBuildLogs: defaultBuildLogger(),
  });
  console.log("Dev template build complete:", info);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
