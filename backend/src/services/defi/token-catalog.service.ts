import { getDeepBookEnv } from "../../config/deepbook.js";
import { getAssetDecimals } from "./asset-scalars.js";
import { fetchIndexerAssets, type IndexerAssetsResponse } from "./deepbook-indexer.client.js";
import { FALLBACK_CATALOG } from "./token-catalog.fallback.js";
import type { TokenCatalogEntry } from "./token-catalog.types.js";

type CatalogState = {
  entries: TokenCatalogEntry[];
  fetchedAt: number;
  source: "indexer" | "fallback";
};

let state: CatalogState | undefined;
let fetchIndexerAssetsFn = fetchIndexerAssets;

function parseIndexerAssets(
  assets: IndexerAssetsResponse,
  popularSymbols: readonly string[],
): TokenCatalogEntry[] {
  const popularSet = new Set(popularSymbols.map((s) => s.toUpperCase()));

  return Object.entries(assets)
    .filter(([, record]) => typeof record.asset_type === "string" && record.asset_type.length > 0)
    .map(([symbol, record]) => ({
      symbol: symbol.toUpperCase(),
      name: record.name ?? symbol,
      coin_type: record.asset_type,
      decimals: getAssetDecimals(symbol),
      popular: popularSet.has(symbol.toUpperCase()),
    }));
}

function sortCatalog(entries: TokenCatalogEntry[], popularSymbols: readonly string[]): TokenCatalogEntry[] {
  const order = new Map(popularSymbols.map((s, i) => [s.toUpperCase(), i]));

  return [...entries].sort((a, b) => {
    const aOrder = order.get(a.symbol);
    const bOrder = order.get(b.symbol);
    if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
    if (aOrder !== undefined) return -1;
    if (bOrder !== undefined) return 1;
    return a.symbol.localeCompare(b.symbol);
  });
}

async function refreshCatalog(): Promise<CatalogState> {
  const { popularSymbols, catalogRefreshMs } = getDeepBookEnv();

  try {
    const assets = await fetchIndexerAssetsFn();
    const entries = sortCatalog(parseIndexerAssets(assets, popularSymbols), popularSymbols);
    state = { entries, fetchedAt: Date.now(), source: "indexer" };
    return state;
  } catch {
    const entries = sortCatalog(FALLBACK_CATALOG, popularSymbols);
    state = { entries, fetchedAt: Date.now(), source: "fallback" };
    return state;
  }
}

async function ensureCatalog(): Promise<CatalogState> {
  const { catalogRefreshMs } = getDeepBookEnv();
  if (!state || Date.now() - state.fetchedAt > catalogRefreshMs) {
    return refreshCatalog();
  }
  return state;
}

/** Full catalog (all DeepBook indexer assets). */
export async function getTokenCatalog(): Promise<{
  entries: TokenCatalogEntry[];
  source: "indexer" | "fallback";
}> {
  const current = await ensureCatalog();
  return { entries: current.entries, source: current.source };
}

/** Popular tokens for wallet balance queries (default display set). */
export async function getCatalogForWallet(): Promise<TokenCatalogEntry[]> {
  const { entries } = await getTokenCatalog();
  const popular = entries.filter((entry) => entry.popular);
  return popular.length > 0 ? popular : entries.slice(0, 5);
}

/** Test hooks */
export function resetTokenCatalogForTests(): void {
  state = undefined;
  fetchIndexerAssetsFn = fetchIndexerAssets;
}

export function setFetchIndexerAssetsForTests(
  fn: typeof fetchIndexerAssets,
): void {
  fetchIndexerAssetsFn = fn;
  state = undefined;
}
