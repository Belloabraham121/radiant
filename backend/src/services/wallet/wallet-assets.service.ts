import { AppError } from "../../errors/app-error.js";
import { resolvePrivyEvmChainId } from "./privy-chain-map.js";
import { getCatalogForWallet, getTokenCatalog } from "../defi/deepbook/token-catalog.service.js";
import { isStablecoinSymbol } from "../defi/deepbook/asset-scalars.js";
import { resolveAgentWalletByPrivyUserId } from "./agent-wallet.service.js";
import type { WalletAssetsData, WalletAssetsQuery } from "./wallet-assets.types.js";
import {
  fetchEvmPrivyWalletAssets,
  fetchSolanaPrivyWalletAssets,
} from "./privy-balance.service.js";
import { fetchSuiCoinBalances } from "./sui-coin-balances.js";
import { enrichWalletAssetsWithMarketData } from "../market/coingecko.service.js";

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

function finalizeAssets(
  data: Omit<WalletAssetsData, "total_usd" | "prices_updated_at">,
  query: WalletAssetsQuery,
): Promise<WalletAssetsData> {
  return finalizeAssetsAsync(data, query);
}

async function finalizeAssetsAsync(
  data: Omit<WalletAssetsData, "total_usd" | "prices_updated_at">,
  query: WalletAssetsQuery,
): Promise<WalletAssetsData> {
  const includeZero = query.include_zero ?? true;
  const includeUsd = query.include_usd ?? true;
  let assets = applyStablecoinUsd(data.assets, includeUsd);
  assets = await enrichWalletAssetsWithMarketData(assets, includeUsd);
  assets = filterAssets(assets, includeZero);
  return {
    ...data,
    assets,
    total_usd: sumUsd(assets),
    prices_updated_at: includeUsd ? new Date().toISOString() : null,
  };
}

async function buildSuiWalletAssets(
  address: string,
  query: WalletAssetsQuery,
): Promise<WalletAssetsData> {
  const [catalog, catalogMeta] = await Promise.all([
    getCatalogForWallet(),
    getTokenCatalog(),
  ]);

  let assets = await fetchSuiCoinBalances(address, catalog);

  return finalizeAssets(
    {
      chain_id: "sui",
      address,
      assets,
      catalog_source: catalogMeta.source,
      updated_at: new Date().toISOString(),
    },
    query,
  );
}

async function buildEvmWalletAssets(
  address: string,
  privyWalletId: string,
  query: WalletAssetsQuery,
): Promise<WalletAssetsData> {
  const evmChainId = resolvePrivyEvmChainId(query.evm_chain_id);
  const includeUsd = query.include_usd ?? true;
  const { assets } = await fetchEvmPrivyWalletAssets(privyWalletId, {
    evmChainId,
    includeUsd,
  });

  return finalizeAssets(
    {
      chain_id: "ethereum",
      address,
      evm_chain_id: evmChainId,
      assets,
      catalog_source: "privy",
      updated_at: new Date().toISOString(),
    },
    query,
  );
}

async function buildSolanaWalletAssets(
  address: string,
  privyWalletId: string,
  query: WalletAssetsQuery,
): Promise<WalletAssetsData> {
  const includeUsd = query.include_usd ?? true;
  const assets = await fetchSolanaPrivyWalletAssets(privyWalletId, { includeUsd });

  return finalizeAssets(
    {
      chain_id: "solana",
      address,
      assets,
      catalog_source: "privy",
      updated_at: new Date().toISOString(),
    },
    query,
  );
}

async function buildWalletAssets(
  wallet: { address: string; privy_wallet_id: string },
  query: WalletAssetsQuery,
): Promise<WalletAssetsData> {
  switch (query.chain_id) {
    case "sui":
      return buildSuiWalletAssets(wallet.address, query);
    case "ethereum":
      return buildEvmWalletAssets(wallet.address, wallet.privy_wallet_id, query);
    case "solana":
      return buildSolanaWalletAssets(wallet.address, wallet.privy_wallet_id, query);
    default:
      throw new AppError(400, "UNSUPPORTED_CHAIN", `Unsupported chain: ${query.chain_id}`);
  }
}

/** Resolve multi-asset balances for a Sui address (no auth / DB). */
export async function getWalletAssetsForAddress(
  address: string,
  query: WalletAssetsQuery,
): Promise<WalletAssetsData> {
  if (query.chain_id !== "sui") {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "getWalletAssetsForAddress only supports chain_id=sui without a registered wallet.",
    );
  }
  return buildSuiWalletAssets(address, query);
}

export async function getWalletAssetsForPrivyUser(
  privyUserId: string,
  query: WalletAssetsQuery,
): Promise<WalletAssetsData> {
  const wallet = await resolveAgentWalletByPrivyUserId(privyUserId, query.chain_id);
  if (!wallet) {
    throw new AppError(
      404,
      "WALLET_NOT_FOUND",
      `No agent wallet registered for chain "${query.chain_id}".`,
    );
  }

  return buildWalletAssets(wallet, query);
}
