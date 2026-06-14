#!/usr/bin/env node
/**
 * Preflight checks for real Walrus Sites deploy from Radiant backend.
 * Usage: node scripts/walrus-setup-check.mjs
 */
import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function checkBin(name) {
  const result = spawnSync("which", [name], { encoding: "utf8" });
  const ok = result.status === 0 && result.stdout.trim().length > 0;
  console.log(ok ? `✓ ${name}` : `✗ ${name} — install via suiup install ${name === "site-builder" ? "site-builder" : name}`);
  return ok;
}

function checkFile(label, path) {
  if (!path) {
    console.log(`⚠ ${label} — not set`);
    return false;
  }
  try {
    accessSync(path, constants.R_OK);
    console.log(`✓ ${label}: ${path}`);
    return true;
  } catch {
    console.log(`✗ ${label}: ${path} (missing or unreadable)`);
    return false;
  }
}

const mock = (process.env.WALRUS_DEPLOY_MOCK ?? "true").trim().toLowerCase();
const mockEnabled = mock === "true" || mock === "1";

console.log("\nRadiant Walrus deploy preflight\n");

if (mockEnabled) {
  console.log("⚠ WALRUS_DEPLOY_MOCK is enabled — deploy returns fake URLs");
  console.log("  Set WALRUS_DEPLOY_MOCK=false in backend/.env for real publish\n");
} else {
  console.log("✓ WALRUS_DEPLOY_MOCK=false (real deploy)\n");
}

console.log("CLI tools:");
const bins = ["sui", "walrus", "site-builder"].map(checkBin);

console.log("\nConfig paths:");
const sitesPath =
  process.env.WALRUS_SITES_CONFIG_PATH?.trim() ||
  join(homedir(), ".config/walrus/sites-config.yaml");
const walrusPath =
  process.env.WALRUS_CONFIG_PATH?.trim() ||
  join(homedir(), ".config/walrus/client_config.yaml");

const files = [
  checkFile("WALRUS_SITES_CONFIG_PATH", sitesPath),
  checkFile("WALRUS_CONFIG_PATH", walrusPath),
];

console.log("\nEnv:");
console.log(`  WALRUS_SITE_EPOCHS=${process.env.WALRUS_SITE_EPOCHS ?? "(default 30)"}`);
console.log(`  WALRUS_PORTAL_BASE_URL=${process.env.WALRUS_PORTAL_BASE_URL ?? "(default https://wal.app — use http://localhost:3000 for testnet)"}`);
console.log(`  WALRUS_SUI_NETWORK=${process.env.WALRUS_SUI_NETWORK ?? process.env.SUI_NETWORK ?? "testnet"}`);

console.log("\nTestnet portal:");
console.log("  wal.app is mainnet-only — run local portal for testnet (see docs/walrus-local-setup.md)");

const ready = !mockEnabled && bins.every(Boolean) && files.every(Boolean);
console.log(ready ? "\n✓ Ready for real Walrus deploy\n" : "\n✗ Fix items above before real deploy\n");
process.exit(ready ? 0 : 1);
