import {
  mainnetCoins,
  mainnetMarginPools,
  mainnetPackageIds,
  mainnetPools,
  testnetCoins,
  testnetMarginPools,
  testnetPackageIds,
  testnetPools,
  type CoinMap,
  type PoolMap,
} from "@mysten/deepbook-v3";
import { optional } from "./optional-env.js";

export type MarginPoolMap = Record<string, { address: string; type: string }>;

const DEFAULT_INDEXER_MAINNET = "https://deepbook-indexer.mainnet.mystenlabs.com";
const DEFAULT_INDEXER_TESTNET = "https://deepbook-indexer.testnet.mystenlabs.com";

const DEFAULT_POPULAR_SYMBOLS = ["SUI", "USDC", "DEEP", "WAL", "USDT"] as const;
const DEFAULT_POOL_MAINNET = "SUI_USDC";
const DEFAULT_POOL_TESTNET = "SUI_DBUSDC";
export const DEFAULT_BALANCE_MANAGER_KEY = "RADIANT_BM_1";

export type DeepBookNetwork = "mainnet" | "testnet";

export type DeepBookEnv = {
  env: DeepBookNetwork;
  indexerUrl: string;
  popularSymbols: readonly string[];
  catalogRefreshMs: number;
  defaultPool: string;
  defaultManagerKey: string;
  coins: CoinMap;
  pools: PoolMap;
  marginPools: MarginPoolMap;
};

let cached: DeepBookEnv | undefined;

function resolveIndexerUrl(env: "mainnet" | "testnet"): string {
  const override = process.env.DEEPBOOK_INDEXER_URL;
  if (override && override.length > 0) {
    return override.replace(/\/$/, "");
  }
  return env === "testnet" ? DEFAULT_INDEXER_TESTNET : DEFAULT_INDEXER_MAINNET;
}

function resolveDeepBookNetwork(): DeepBookNetwork {
  const suiNetwork = optional("SUI_NETWORK", "").toLowerCase();
  if (suiNetwork === "testnet") return "testnet";
  if (suiNetwork === "mainnet") return "mainnet";

  const rpc = optional("SUI_RPC_URL", "");
  if (rpc.includes("testnet")) return "testnet";
  if (rpc.includes("mainnet")) return "mainnet";

  const raw = optional("DEEPBOOK_ENV", "").toLowerCase();
  if (raw === "testnet") return "testnet";
  return "mainnet";
}

function resolveDefaultPool(env: DeepBookNetwork, pools: PoolMap): string {
  const networkDefault = env === "testnet" ? DEFAULT_POOL_TESTNET : DEFAULT_POOL_MAINNET;
  const override = optional("DEEPBOOK_DEFAULT_POOL", "");
  if (override.length > 0) {
    const normalized = override.trim().toUpperCase();
    if (pools[normalized as keyof typeof pools]) {
      return normalized;
    }
    if (env === "testnet" && normalized === "SUI_USDC" && pools.SUI_DBUSDC) {
      return "SUI_DBUSDC";
    }
    if (env === "testnet" && normalized === "DEEP_USDC" && pools.DEEP_DBUSDC) {
      return "DEEP_DBUSDC";
    }
  }
  return networkDefault;
}

function resolveCoinsAndPools(env: DeepBookNetwork): { coins: CoinMap; pools: PoolMap } {
  if (env === "testnet") {
    return { coins: testnetCoins, pools: testnetPools };
  }
  return { coins: mainnetCoins, pools: mainnetPools };
}

export function getDeepBookEnv(): DeepBookEnv {
  if (!cached) {
    const env = resolveDeepBookNetwork();
    const popularRaw = optional("WALLET_POPULAR_SYMBOLS", "");
    const popularSymbols =
      popularRaw.length > 0
        ? popularRaw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
        : [...DEFAULT_POPULAR_SYMBOLS];
    const { coins, pools } = resolveCoinsAndPools(env);
    const marginPools = (env === "testnet" ? testnetMarginPools : mainnetMarginPools) as MarginPoolMap;

    cached = {
      env,
      indexerUrl: resolveIndexerUrl(env),
      popularSymbols,
      catalogRefreshMs: Number(optional("DEEPBOOK_CATALOG_REFRESH_MS", String(60 * 60 * 1000))),
      defaultPool: resolveDefaultPool(env, pools),
      defaultManagerKey: DEFAULT_BALANCE_MANAGER_KEY,
      coins,
      pools,
      marginPools,
    };
  }
  return cached;
}

/**
 * Returns trading pool keys where both the base and quote coins have
 * corresponding margin (lending) pools — meaning margin trading is supported.
 */
export function getMarginEnabledPoolKeys(): string[] {
  const env = getDeepBookEnv();
  const marginAssets = new Set(Object.keys(env.marginPools).map((k) => k.toUpperCase()));
  const results: string[] = [];

  for (const [poolKey, pool] of Object.entries(env.pools)) {
    const baseCoin = String((pool as { baseCoin?: string }).baseCoin ?? "").toUpperCase();
    const quoteCoin = String((pool as { quoteCoin?: string }).quoteCoin ?? "").toUpperCase();
    if (marginAssets.has(baseCoin) && marginAssets.has(quoteCoin)) {
      results.push(poolKey);
    }
  }

  return results;
}

/** Margin Move package id for the active DeepBook network. */
export function getMarginPackageId(): string {
  return getDeepBookEnv().env === "testnet"
    ? testnetPackageIds.MARGIN_PACKAGE_ID
    : mainnetPackageIds.MARGIN_PACKAGE_ID;
}

/** Fully qualified SupplierCap struct type for owned-object lookups. */
export function getMarginSupplierCapType(): string {
  return `${getMarginPackageId()}::margin_pool::SupplierCap`;
}

/** Fully qualified SupplyReferral struct type for created-object lookups. */
export function getMarginSupplyReferralType(): string {
  return `${getMarginPackageId()}::protocol_fees::SupplyReferral`;
}

/** Whether margin maintainer admin execute actions are enabled (off by default). */
export function isDeepBookMarginMaintainerEnabled(): boolean {
  return optional("DEEPBOOK_MARGIN_MAINTAINER_ENABLED", "").toLowerCase() === "true";
}

/** Maintainer capability object id for createMarginPool and related registry ops. */
export function getMarginMaintainerCapId(): string | undefined {
  const id = optional("DEEPBOOK_MARGIN_MAINTAINER_CAP_ID", "").trim();
  return id.startsWith("0x") ? id : undefined;
}

/** Margin admin capability for protocol-fee and default-referral withdrawals. */
export function getMarginAdminCapId(): string | undefined {
  const id = optional("DEEPBOOK_MARGIN_ADMIN_CAP_ID", "").trim();
  return id.startsWith("0x") ? id : undefined;
}

/** Margin pool cap for per-pool maintainer operations (enable/disable loans, maintainer fees). */
export function getMarginPoolCapId(): string | undefined {
  const id = optional("DEEPBOOK_MARGIN_POOL_CAP_ID", "").trim();
  return id.startsWith("0x") ? id : undefined;
}

/** Registry id for the active DeepBook margin network. */
export function getMarginRegistryId(): string {
  return getDeepBookEnv().env === "testnet"
    ? testnetPackageIds.MARGIN_REGISTRY_ID
    : mainnetPackageIds.MARGIN_REGISTRY_ID;
}

/** Test hook — reset cached env. */
export function resetDeepBookEnvForTests(): void {
  cached = undefined;
}
