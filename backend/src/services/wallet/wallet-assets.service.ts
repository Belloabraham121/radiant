import { AppError } from "../../errors/app-error.js";
import type { ChainId } from "../chains/types.js";
import { getCatalogForWallet, getTokenCatalog } from "../defi/token-catalog.service.js";
import { isStablecoinSymbol } from "../defi/asset-scalars.js";
import { resolveAgentWalletByPrivyUserId } from "./agent-wallet.service.js";
import {
  clearWalletAssetsCacheForTests,
  getCachedWalletAssets,
  setCachedWalletAssets,
} from "./wallet-assets.cache.js";
import type { WalletAssetsData } from "./wallet-assets.types.js";
import { fetchSuiCoinBalances } from "./sui-coin-balances.js";

export type WalletAssetsQuery = {
  chain_id: ChainId;
  include_zero?: boolean;
  include_usd?: boolean;
};

function sumUsd(assets: WalletAssetsData["assets"]): number | null {
  const values = assets.map((a) => a.usd_value).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0);
}

function applyStablecoinUsd(
  assets: WalletAssetsData["assets"],
  includeUsd: boolean,
): WalletAssetsData["assets"] {
  if (!includeUsd) {
    return assets.map((asset) => ({ ...asset, usd_value: null }));
  }

  return assets.map((asset) => {
    if (asset.usd_value !== null) return asset;
    if (isStablecoinSymbol(asset.symbol)) {
      return { ...asset, usd_value: asset.balance_display };
    }
    return asset;
  });
}

function filterAssets(
  assets: WalletAssetsData["assets"],
  includeZero: boolean,
): WalletAssetsData["assets"] {
  if (includeZero) return assets;
  return assets.filter((asset) => asset.balance_atomic !== "0");
}

async function buildSuiWalletAssets(
  address: string,
  query: WalletAssetsQuery,
): Promise<WalletAssetsData> {
  const includeZero = query.include_zero ?? true;
  const includeUsd = query.include_usd ?? true;

  const [catalog, catalogMeta] = await Promise.all([
    getCatalogForWallet(),
    getTokenCatalog(),
  ]);

  let assets = await fetchSuiCoinBalances(address, catalog);
  assets = applyStablecoinUsd(assets, includeUsd);
  assets = filterAssets(assets, includeZero);

  const updatedAt = new Date().toISOString();

  return {
    chain_id: "sui",
    address,
    total_usd: sumUsd(assets),
    assets,
    catalog_source: catalogMeta.source,
    updated_at: updatedAt,
  };
}

/** Resolve multi-asset balances for a Sui address (no auth / DB). */
export async function getWalletAssetsForAddress(
  address: string,
  query: WalletAssetsQuery,
): Promise<WalletAssetsData> {
  if (query.chain_id !== "sui") {
    throw new AppError(
      501,
      "NOT_IMPLEMENTED",
      `Multi-asset balances for "${query.chain_id}" are not implemented yet. Use chain=sui.`,
    );
  }
  return buildSuiWalletAssets(address, query);
}

export async function getWalletAssetsForPrivyUser(
  privyUserId: string,
  query: WalletAssetsQuery,
): Promise<WalletAssetsData> {
  if (query.chain_id !== "sui") {
    throw new AppError(
      501,
      "NOT_IMPLEMENTED",
      `Multi-asset balances for "${query.chain_id}" are not implemented yet. Use chain=sui.`,
    );
  }

  const cached = await getCachedWalletAssets(privyUserId, query.chain_id);
  if (cached) {
    const includeZero = query.include_zero ?? true;
    const includeUsd = query.include_usd ?? true;
    let assets = applyStablecoinUsd(cached.assets, includeUsd);
    assets = filterAssets(assets, includeZero);
    return {
      ...cached,
      assets,
      total_usd: sumUsd(assets),
    };
  }

  const wallet = await resolveAgentWalletByPrivyUserId(privyUserId, query.chain_id);
  if (!wallet) {
    throw new AppError(
      404,
      "WALLET_NOT_FOUND",
      `No agent wallet registered for chain "${query.chain_id}".`,
    );
  }

  const data = await buildSuiWalletAssets(wallet.address, query);
  await setCachedWalletAssets(privyUserId, query.chain_id, data);
  return data;
}

export { clearWalletAssetsCacheForTests };
