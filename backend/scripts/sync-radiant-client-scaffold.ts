import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RADIANT_CLIENT_TS } from "../src/services/projects/radiant-client-template.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "docker/e2b/scaffold/lib/radiant-client.ts");

writeFileSync(target, RADIANT_CLIENT_TS);
console.log("Synced radiant-client scaffold ->", target);
