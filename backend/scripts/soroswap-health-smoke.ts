import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { getSoroswapConfig } from "../src/config/soroswap.js";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, "../.env") });

async function main(): Promise<void> {
  const { apiBaseUrl, apiKey, network } = getSoroswapConfig();

  if (!apiKey) {
    console.log("SOROSWAP_API_KEY not set — skipping Soroswap health check.");
    console.log("Set SOROSWAP_API_KEY in backend/.env to run this smoke test.");
    process.exit(0);
  }

  const url = new URL("/health", `${apiBaseUrl}/`);
  url.searchParams.set("network", network);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  const body = await response.text();
  if (!response.ok) {
    console.error(`Soroswap health check failed: HTTP ${response.status}`);
    console.error(body.slice(0, 500));
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    console.error("Soroswap health check returned non-JSON body:");
    console.error(body.slice(0, 500));
    process.exit(1);
  }

  console.log(`✓ Soroswap GET /health (${network}) — HTTP ${response.status}`);
  console.log(JSON.stringify(parsed, null, 2));
}

main().catch((err: unknown) => {
  console.error("Soroswap health smoke test failed:", err);
  process.exit(1);
});
