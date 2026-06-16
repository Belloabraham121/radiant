import { getDeepBookEnv, getMarginEnabledPoolKeys } from "../../../config/deepbook.js";
import { AppError } from "../../../errors/app-error.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import { isDeepBookPoolKey } from "./coin-key.js";
import {
  getLiquidationThreshold,
  getMaxLeverage,
  MARGIN_POOL_CONFIGS,
} from "./deepbook-margin.service.js";
import { resolveMarginPoolCoinKey } from "./margin-pool-coin-key.js";
import { getDeepBookClient } from "./providers/sui-deepbook.provider.js";
import { resolveSupplierCapObjectId } from "./margin-supplier-cap.service.js";

const DEFAULT_READ_WALLET = `0x${"0".repeat(64)}`;

export type MarginPoolLiveState = {
  coin_key: string;
  pool_id: string;
  total_supply: string;
  total_borrow: string;
  supply_shares: string;
  borrow_shares: string;
  interest_rate: number;
  utilization_rate: number | null;
  max_utilization_rate: number;
  supply_cap: string;
  min_borrow: string;
  protocol_spread: number;
  last_update_timestamp: number;
};

export type MarginPoolUserSupply = {
  supplier_cap_id: string;
  supply_shares: string;
  supply_amount: string;
};

export type MarginPoolInfoQueryResult = {
  pool_key: string;
  coin_key: string;
  max_leverage: number;
  liquidation_ratio: number;
  borrow_threshold: number;
  available_margin_pools: string[];
  available_margin_pool_assets: string[];
  live_state?: MarginPoolLiveState;
  live_state_error?: string;
  user_supply?: MarginPoolUserSupply;
  user_supply_error?: string;
};

export function computeUtilizationRate(
  totalSupply: string,
  totalBorrow: string,
): number | null {
  const supply = Number(totalSupply);
  const borrow = Number(totalBorrow);
  if (!Number.isFinite(supply) || !Number.isFinite(borrow) || supply <= 0) {
    return borrow > 0 ? null : 0;
  }
  return borrow / supply;
}

export function resolveCoinKeyForMarginPoolQuery(params: Record<string, unknown>): string {
  const rawCoin = params.coin_type ?? params.coin_key ?? params.coinKey;
  if (rawCoin != null && String(rawCoin).trim().length > 0) {
    return resolveMarginPoolCoinKey(rawCoin);
  }

  const poolKey = String(params.pool_key ?? params.poolKey ?? "")
    .trim()
    .toUpperCase();
  if (poolKey && isDeepBookPoolKey(poolKey)) {
    const pool = getDeepBookEnv().pools[poolKey as keyof ReturnType<typeof getDeepBookEnv>["pools"]];
    const quoteCoin = String((pool as { quoteCoin?: string }).quoteCoin ?? "USDC").toUpperCase();
    return resolveMarginPoolCoinKey(quoteCoin);
  }

  const assets = Object.keys(getDeepBookEnv().marginPools);
  const preferred = assets.includes("USDC")
    ? "USDC"
    : assets.includes("DBUSDC")
      ? "DBUSDC"
      : assets[0];
  if (!preferred) {
    throw new AppError(503, "NO_MARGIN_POOLS", "No margin pool assets configured in this environment.");
  }
  return resolveMarginPoolCoinKey(preferred);
}

function resolveTradingPoolKey(
  params: Record<string, unknown>,
  marginEnabledPools: string[],
): string {
  const raw = params.pool_key ?? params.poolKey;
  if (typeof raw === "string" && raw.trim().length > 0) {
    const normalized = raw.trim().toUpperCase();
    if (isDeepBookPoolKey(normalized)) {
      return normalized;
    }
  }
  return marginEnabledPools[0] ?? getDeepBookEnv().defaultPool;
}

async function resolveReadWalletAddress(privyUserId: string): Promise<string> {
  const wallet = await resolveAgentWalletByPrivyUserId(privyUserId, "sui");
  return wallet?.address ?? DEFAULT_READ_WALLET;
}

export async function fetchMarginPoolLiveState(
  walletAddress: string,
  coinKey: string,
): Promise<MarginPoolLiveState> {
  const client = getDeepBookClient({ address: walletAddress });

  const [
    poolId,
    totalSupply,
    totalBorrow,
    supplyShares,
    borrowShares,
    interestRate,
    maxUtilizationRate,
    supplyCap,
    minBorrow,
    protocolSpread,
    lastUpdateTimestamp,
  ] = await Promise.all([
    client.getMarginPoolId(coinKey),
    client.getMarginPoolTotalSupply(coinKey),
    client.getMarginPoolTotalBorrow(coinKey),
    client.getMarginPoolSupplyShares(coinKey),
    client.getMarginPoolBorrowShares(coinKey),
    client.getMarginPoolInterestRate(coinKey),
    client.getMarginPoolMaxUtilizationRate(coinKey),
    client.getMarginPoolSupplyCap(coinKey),
    client.getMarginPoolMinBorrow(coinKey),
    client.getMarginPoolProtocolSpread(coinKey),
    client.getMarginPoolLastUpdateTimestamp(coinKey),
  ]);

  return {
    coin_key: coinKey,
    pool_id: poolId,
    total_supply: totalSupply,
    total_borrow: totalBorrow,
    supply_shares: supplyShares,
    borrow_shares: borrowShares,
    interest_rate: interestRate,
    utilization_rate: computeUtilizationRate(totalSupply, totalBorrow),
    max_utilization_rate: maxUtilizationRate,
    supply_cap: supplyCap,
    min_borrow: minBorrow,
    protocol_spread: protocolSpread,
    last_update_timestamp: lastUpdateTimestamp,
  };
}

async function fetchUserSupplyPosition(
  walletAddress: string,
  coinKey: string,
  supplierCapId: string,
): Promise<MarginPoolUserSupply> {
  const client = getDeepBookClient({ address: walletAddress });
  const [supplyShares, supplyAmount] = await Promise.all([
    client.getUserSupplyShares(coinKey, supplierCapId),
    client.getUserSupplyAmount(coinKey, supplierCapId),
  ]);

  return {
    supplier_cap_id: supplierCapId,
    supply_shares: supplyShares,
    supply_amount: supplyAmount,
  };
}

function resolveSupplierCapParam(params: Record<string, unknown>): string | undefined {
  const raw = params.supplier_cap_id ?? params.supplierCapId;
  if (typeof raw === "string" && raw.startsWith("0x")) {
    return raw;
  }
  return undefined;
}

export async function queryMarginPoolInfo(
  privyUserId: string,
  params: Record<string, unknown> = {},
): Promise<MarginPoolInfoQueryResult> {
  const marginEnabledPools = getMarginEnabledPoolKeys();
  const tradingPoolKey = resolveTradingPoolKey(params, marginEnabledPools);
  const coinKey = resolveCoinKeyForMarginPoolQuery(params);
  const poolConfig = MARGIN_POOL_CONFIGS[tradingPoolKey];
  const walletAddress = await resolveReadWalletAddress(privyUserId);

  let liveState: MarginPoolLiveState | undefined;
  let liveStateError: string | undefined;

  try {
    liveState = await fetchMarginPoolLiveState(walletAddress, coinKey);
  } catch (err) {
    liveStateError = err instanceof Error ? err.message : String(err);
  }

  let userSupply: MarginPoolUserSupply | undefined;
  let userSupplyError: string | undefined;

  const explicitCapId = resolveSupplierCapParam(params);
  const agentWallet = await resolveAgentWalletByPrivyUserId(privyUserId, "sui");
  const supplierCapId =
    explicitCapId ??
    (agentWallet ? await resolveSupplierCapObjectId(privyUserId, agentWallet.address) : null);

  if (supplierCapId) {
    try {
      userSupply = await fetchUserSupplyPosition(
        agentWallet?.address ?? walletAddress,
        coinKey,
        supplierCapId,
      );
    } catch (err) {
      userSupplyError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    pool_key: tradingPoolKey,
    coin_key: coinKey,
    max_leverage: poolConfig?.maxLeverage ?? getMaxLeverage(tradingPoolKey),
    liquidation_ratio: poolConfig?.liquidationRatio ?? getLiquidationThreshold(tradingPoolKey),
    borrow_threshold: poolConfig?.borrowThreshold ?? 1.25,
    available_margin_pools: marginEnabledPools,
    available_margin_pool_assets: Object.keys(getDeepBookEnv().marginPools),
    ...(liveState ? { live_state: liveState } : {}),
    ...(liveStateError ? { live_state_error: liveStateError } : {}),
    ...(userSupply ? { user_supply: userSupply } : {}),
    ...(userSupplyError ? { user_supply_error: userSupplyError } : {}),
  };
}

/** Test hook — human-readable summary for the agent model. */
export function formatMarginPoolLiveStateSummary(live: MarginPoolLiveState): string {
  const utilization =
    live.utilization_rate != null
      ? `${(live.utilization_rate * 100).toFixed(2)}%`
      : "n/a";
  return (
    `${live.coin_key} margin pool: supply ${live.total_supply}, borrow ${live.total_borrow}, ` +
    `utilization ${utilization}, interest rate ${(live.interest_rate * 100).toFixed(4)}%`
  );
}

export function formatMarginPoolInfoSummary(result: MarginPoolInfoQueryResult): string {
  const lines = [
    `Trading pool ${result.pool_key} (max leverage ${result.max_leverage}x).`,
    `Margin-enabled trading pools: ${result.available_margin_pools.join(", ") || "none"}.`,
  ];

  if (result.live_state) {
    lines.push(formatMarginPoolLiveStateSummary(result.live_state));
  } else if (result.live_state_error) {
    lines.push(`Live pool metrics unavailable: ${result.live_state_error}`);
  }

  if (result.user_supply) {
    lines.push(
      `Your supplied liquidity: ${result.user_supply.supply_amount} ${result.coin_key} ` +
        `(shares ${result.user_supply.supply_shares}).`,
    );
  } else if (result.user_supply_error) {
    lines.push(`User supply position unavailable: ${result.user_supply_error}`);
  }

  return lines.join("\n");
}
