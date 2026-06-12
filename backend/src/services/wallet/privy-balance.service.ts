import { getPrivyClient } from "../../infrastructure/privy/client.js";
import { isStablecoinSymbol } from "../defi/asset-scalars.js";
import { evmChainIdToPrivyChain, resolvePrivyEvmChainId } from "./privy-chain-map.js";
import type {
  PrivyBalanceGetParams,
  PrivyBalanceGetResponse,
  PrivyBalanceRow,
  PrivyChain,
  PrivyNamedAsset,
} from "./privy-balance.types.js";
import type { WalletAssetRow } from "./wallet-assets.types.js";

const EVM_NAMED_ASSETS: PrivyNamedAsset[] = ["eth", "usdc", "usdt"];
const SOLANA_NAMED_ASSETS: PrivyNamedAsset[] = ["sol", "usdc"];

const ASSET_SYMBOLS: Record<PrivyNamedAsset, string> = {
  eth: "ETH",
  sol: "SOL",
  usdc: "USDC",
  usdt: "USDT",
  pol: "POL",
};

const ASSET_NAMES: Record<PrivyNamedAsset, string> = {
  eth: "Ethereum",
  sol: "Solana",
  usdc: "USD Coin",
  usdt: "Tether USD",
  pol: "Polygon",
};

type BalanceGetFn = (
  walletId: string,
  query: PrivyBalanceGetParams,
) => Promise<PrivyBalanceGetResponse>;

let balanceGetFn: BalanceGetFn = async (walletId, query) => {
  const client = getPrivyClient();
  return client.wallets().balance.get(
    walletId,
    query as Parameters<ReturnType<typeof client.wallets>["balance"]["get"]>[1],
  ) as Promise<PrivyBalanceGetResponse>;
};

function parseUsdValue(
  displayValues: PrivyBalanceRow["display_values"],
  includeUsd: boolean,
): number | null {
  if (!includeUsd) return null;
  const raw = displayValues.usd;
  if (raw === undefined) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapPrivyBalance(
  balance: PrivyBalanceRow,
  privyChain: string,
  includeUsd: boolean,
): WalletAssetRow {
  const asset = balance.asset;
  const symbol = ASSET_SYMBOLS[asset];
  const decimals = balance.raw_value_decimals;
  const balanceAtomic = balance.raw_value;
  const displayKey = asset in balance.display_values ? asset : Object.keys(balance.display_values)[0];
  const balanceDisplay =
    displayKey && balance.display_values[displayKey] !== undefined
      ? Number.parseFloat(balance.display_values[displayKey])
      : Number(balanceAtomic) / 10 ** decimals;

  let usdValue = parseUsdValue(balance.display_values, includeUsd);
  if (usdValue === null && includeUsd && isStablecoinSymbol(symbol)) {
    usdValue = balanceDisplay;
  }

  return {
    symbol,
    name: ASSET_NAMES[asset],
    coin_type: `privy:${privyChain}:${asset}`,
    balance_atomic: balanceAtomic,
    balance_display: Number.isFinite(balanceDisplay) ? balanceDisplay : 0,
    decimals,
    usd_value: usdValue,
    source: "privy",
    popular: true,
  };
}

function zeroRow(
  asset: PrivyNamedAsset,
  privyChain: string,
  includeUsd: boolean,
): WalletAssetRow {
  const symbol = ASSET_SYMBOLS[asset];
  if (asset === "sol") {
    return {
      symbol,
      name: ASSET_NAMES[asset],
      coin_type: `privy:${privyChain}:${asset}`,
      balance_atomic: "0",
      balance_display: 0,
      decimals: 9,
      usd_value: includeUsd ? 0 : null,
      source: "privy",
      popular: true,
    };
  }

  return {
    symbol,
    name: ASSET_NAMES[asset],
    coin_type: `privy:${privyChain}:${asset}`,
    balance_atomic: "0",
    balance_display: 0,
    decimals: asset === "eth" || asset === "pol" ? 18 : 6,
    usd_value: includeUsd && isStablecoinSymbol(symbol) ? 0 : null,
    source: "privy",
    popular: true,
  };
}

async function fetchNamedAssets(
  privyWalletId: string,
  assets: PrivyNamedAsset[],
  privyChain: PrivyChain,
  includeUsd: boolean,
): Promise<WalletAssetRow[]> {
  const response = await balanceGetFn(privyWalletId, {
    asset: assets,
    chain: privyChain,
    ...(includeUsd ? { include_currency: "usd" } : {}),
  });

  const byAsset = new Map(
    response.balances.map((balance) => [
      balance.asset,
      mapPrivyBalance(balance, privyChain, includeUsd),
    ]),
  );

  return assets.map((asset) => byAsset.get(asset) ?? zeroRow(asset, privyChain, includeUsd));
}

export async function fetchEvmPrivyWalletAssets(
  privyWalletId: string,
  options?: { evmChainId?: number; includeUsd?: boolean },
): Promise<{ assets: WalletAssetRow[]; privyChain: string; evmChainId: number }> {
  const evmChainId = resolvePrivyEvmChainId(options?.evmChainId);
  const privyChain = evmChainIdToPrivyChain(evmChainId);
  const includeUsd = options?.includeUsd ?? true;
  const rows = await fetchNamedAssets(privyWalletId, EVM_NAMED_ASSETS, privyChain, includeUsd);

  return {
    assets: rows,
    privyChain,
    evmChainId,
  };
}

export async function fetchSolanaPrivyWalletAssets(
  privyWalletId: string,
  options?: { includeUsd?: boolean },
): Promise<WalletAssetRow[]> {
  const includeUsd = options?.includeUsd ?? true;
  return fetchNamedAssets(privyWalletId, SOLANA_NAMED_ASSETS, "solana", includeUsd);
}

/** Test hook — mock Privy balance.get. */
export function setPrivyBalanceGetForTests(fn: BalanceGetFn | null): void {
  balanceGetFn =
    fn ??
    (async (walletId, query) => {
      const client = getPrivyClient();
      return client.wallets().balance.get(
        walletId,
        query as Parameters<ReturnType<typeof client.wallets>["balance"]["get"]>[1],
      ) as Promise<PrivyBalanceGetResponse>;
    });
}
