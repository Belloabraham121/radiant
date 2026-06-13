import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules") continue;
      walk(p, files);
    } else if (name.endsWith(".ts")) {
      files.push(p);
    }
  }
  return files;
}

const replacements = [
  [/services\/defi\/indexer\//g, "services/defi/deepbook/indexer/"],
  [/services\/defi\/providers\//g, "services/defi/deepbook/providers/"],
  [/from "\.\.\/\.\.\/defi\/deepbook-/g, 'from "../../defi/deepbook/deepbook-'],
  [/from "\.\.\/defi\/deepbook-/g, 'from "../defi/deepbook/deepbook-'],
  [/from "\.\.\/\.\.\/\.\.\/\.\.\/services\/defi\/deepbook-/g, 'from "../../../../services/defi/deepbook/deepbook-'],
  [/from "\.\.\/\.\.\/src\/services\/defi\/deepbook-/g, 'from "../../src/services/defi/deepbook/deepbook-'],
  [/from "\.\.\/\.\.\/\.\.\/src\/services\/defi\/deepbook-/g, 'from "../../../src/services/defi/deepbook/deepbook-'],
  [/from "\.\.\/\.\.\/defi\/order-constraints/g, 'from "../../defi/deepbook/order-constraints'],
  [/from "\.\.\/\.\.\/defi\/pool-key/g, 'from "../../defi/deepbook/pool-key'],
  [/from "\.\.\/\.\.\/defi\/coin-key/g, 'from "../../defi/deepbook/coin-key'],
  [/from "\.\.\/defi\/order-constraints/g, 'from "../defi/deepbook/order-constraints'],
  [/from "\.\.\/defi\/pool-key/g, 'from "../defi/deepbook/pool-key'],
  [/from "\.\.\/defi\/coin-key/g, 'from "../defi/deepbook/coin-key'],
  [/from "\.\.\/defi\/asset-scalars/g, 'from "../defi/deepbook/asset-scalars'],
  [/from "\.\.\/defi\/token-catalog/g, 'from "../defi/deepbook/token-catalog'],
  [/from "\.\.\/\.\.\/defi\/asset-scalars/g, 'from "../../defi/deepbook/asset-scalars'],
  [/from "\.\.\/\.\.\/defi\/token-catalog/g, 'from "../../defi/deepbook/token-catalog'],
  [/from "\.\.\/\.\.\/\.\.\/src\/services\/defi\/order-constraints/g, 'from "../../../src/services/defi/deepbook/order-constraints'],
  [/from "\.\.\/\.\.\/\.\.\/src\/services\/defi\/pool-key/g, 'from "../../../src/services/defi/deepbook/pool-key'],
  [/from "\.\.\/\.\.\/\.\.\/src\/services\/defi\/swap-registry/g, 'from "../../../src/services/defi/deepbook/swap-registry'],
  [/from "\.\.\/\.\.\/\.\.\/src\/services\/defi\/token-catalog/g, 'from "../../../src/services/defi/deepbook/token-catalog'],
  [/from "\.\.\/\.\.\/src\/services\/defi\/token-catalog/g, 'from "../../src/services/defi/deepbook/token-catalog'],
  [/from "\.\.\/defi\/swap-registry/g, 'from "../defi/deepbook/swap-registry'],
  [/from "\.\.\/agent\/validate-execute-transaction/g, 'from "../agent/deepbook/validate-execute-transaction'],
  [/from "\.\/validate-execute-transaction/g, 'from "./deepbook/validate-execute-transaction'],
  [/from "\.\/transaction-error-context/g, 'from "./deepbook/transaction-error-context'],
  [/from "\.\/single-swap-flow/g, 'from "./deepbook/single-swap-flow'],
  [/from "\.\.\/deposit-approval-flow/g, 'from "../deepbook/deposit-approval-flow'],
  [/from "\.\.\/withdraw-approval-flow/g, 'from "../deepbook/withdraw-approval-flow'],
  [/from "\.\.\/compound-request-flow/g, 'from "../deepbook/compound-request-flow'],
  [/from "\.\.\/swap-approval-flow/g, 'from "../deepbook/swap-approval-flow'],
  [/from "\.\.\/flash-loan-approval-flow/g, 'from "../deepbook/flash-loan-approval-flow'],
  [/from "\.\.\/unsupported-capabilities/g, 'from "../deepbook/unsupported-capabilities'],
  [/from "\.\.\/transaction-error-context/g, 'from "../deepbook/transaction-error-context'],
  [/from "\.\/build-display/g, 'from "./deepbook/build-display'],
  [/from "\.\/categorize-action/g, 'from "./deepbook/categorize-action'],
  [/from "\.\.\/agent-transaction\/build-display/g, 'from "../agent-transaction/deepbook/build-display'],
  [/services\/agent\/swap-approval-flow/g, "services/agent/deepbook/swap-approval-flow"],
  [/services\/agent\/flash-loan-approval-flow/g, "services/agent/deepbook/flash-loan-approval-flow"],
  [/services\/agent\/unsupported-capabilities/g, "services/agent/deepbook/unsupported-capabilities"],
  [/services\/agent\/withdraw-approval-flow/g, "services/agent/deepbook/withdraw-approval-flow"],
  [/services\/agent\/deposit-approval-flow/g, "services/agent/deepbook/deposit-approval-flow"],
  [/services\/agent\/classify-execute-action/g, "services/agent/deepbook/classify-execute-action"],
  [/services\/agent\/validate-execute-transaction/g, "services/agent/deepbook/validate-execute-transaction"],
  [/services\/agent\/compound-request-flow/g, "services/agent/deepbook/compound-request-flow"],
  [/services\/agent-transaction\/build-display/g, "services/agent-transaction/deepbook/build-display"],
  [/services\/agent-transaction\/categorize-action/g, "services/agent-transaction/deepbook/categorize-action"],
  [/from "\.\.\/\.\.\/\.\.\/src\/services\/defi\/deepbook-indexer\.client/g, 'from "../../../src/services/defi/deepbook/indexer/deepbook-indexer.client'],
];

let changed = 0;
for (const file of walk(join(root, "src")).concat(walk(join(root, "tests")))) {
  let text = readFileSync(file, "utf8");
  const original = text;
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }
  if (text !== original) {
    writeFileSync(file, text);
    changed++;
  }
}

console.log(`Updated ${changed} files`);
