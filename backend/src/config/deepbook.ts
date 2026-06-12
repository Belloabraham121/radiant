import { optional } from "./optional-env.js";

const DEFAULT_INDEXER_MAINNET = "https://deepbook-indexer.mainnet.mystenlabs.com";
const DEFAULT_INDEXER_TESTNET = "https://deepbook-indexer.testnet.mystenlabs.com";

const DEFAULT_POPULAR_SYMBOLS = ["SUI", "USDC", "DEEP", "WAL", "USDT"] as const;

export type DeepBookEnv = {
  env: "mainnet" | "testnet";
  indexerUrl: string;
  popularSymbols: readonly string[];
  catalogRefreshMs: number;
  walletAssetCacheTtlSec: number;
};

let cached: DeepBookEnv | undefined;

function resolveIndexerUrl(env: "mainnet" | "testnet"): string {
  const override = process.env.DEEPBOOK_INDEXER_URL;
  if (override && override.length > 0) {
    return override.replace(/\/$/, "");
  }
  return env === "testnet" ? DEFAULT_INDEXER_TESTNET : DEFAULT_INDEXER_MAINNET;
}

function resolveDeepBookNetwork(): "mainnet" | "testnet" {
  const raw = optional("DEEPBOOK_ENV", "").toLowerCase();
  if (raw === "testnet") return "testnet";
  const rpc = optional("SUI_RPC_URL", "");
  if (rpc.includes("testnet")) return "testnet";
  return "mainnet";
}

export function getDeepBookEnv(): DeepBookEnv {
  if (!cached) {
    const env = resolveDeepBookNetwork();
    const popularRaw = optional("WALLET_POPULAR_SYMBOLS", "");
    const popularSymbols =
      popularRaw.length > 0
        ? popularRaw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
        : [...DEFAULT_POPULAR_SYMBOLS];

    cached = {
      env,
      indexerUrl: resolveIndexerUrl(env),
      popularSymbols,
      catalogRefreshMs: Number(optional("DEEPBOOK_CATALOG_REFRESH_MS", String(60 * 60 * 1000))),
      walletAssetCacheTtlSec: Number(optional("WALLET_ASSET_CACHE_TTL_SEC", "60")),
    };
  }
  return cached;
}

/** Test hook — reset cached env. */
export function resetDeepBookEnvForTests(): void {
  cached = undefined;
}
