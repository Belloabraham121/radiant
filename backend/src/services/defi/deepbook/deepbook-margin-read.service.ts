import { bcs } from "@mysten/sui/bcs";
import { deepbook, type DeepBookClient } from "@mysten/deepbook-v3";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { getDeepBookEnv, getMarginEnabledPoolKeys } from "../../../config/deepbook.js";
import { AppError } from "../../../errors/app-error.js";
import { getSuiClient } from "../../../infrastructure/sui/client.js";
import {
  getLiquidationThreshold,
  getMaxLeverage,
  MARGIN_POOL_CONFIGS,
} from "./deepbook-margin.service.js";
import { resolveMarginManagerIdsForUser } from "./margin-manager-lookup.service.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";

export const DEFAULT_MARGIN_MANAGER_SDK_KEY = "MARGIN_1";

const MarginManagerObjectFields = bcs.struct("MarginManagerObjectFields", {
  id: bcs.Address,
  owner: bcs.Address,
  deepbook_pool: bcs.Address,
  margin_pool_id: bcs.option(bcs.Address),
  balance_manager_id: bcs.Address,
});

export type MarginManagerLiveState = {
  pool_key: string;
  owner: string;
  deepbook_pool: string;
  margin_pool_id: string | null;
  risk_ratio: number;
  base_asset: string;
  quote_asset: string;
  base_debt: string;
  quote_debt: string;
  base_balance: string;
  quote_balance: string;
  deep_balance: string;
  borrowed_base_shares: string;
  borrowed_quote_shares: string;
  has_base_debt: boolean;
  base_pyth_price: string;
  base_pyth_decimals: number;
  quote_pyth_price: string;
  quote_pyth_decimals: number;
  current_price: string;
  lowest_trigger_above_price: string;
  highest_trigger_below_price: string;
  max_leverage: number;
  liquidation_ratio: number;
  borrow_threshold: number;
};

export type MarginManagerInfoQueryResult = {
  provisioned: boolean;
  margin_manager_key?: string;
  margin_manager_address?: string;
  manager_count?: number;
  lookup_source?: string;
  rpc_warning?: string;
  live_state?: MarginManagerLiveState;
  live_state_error?: string;
  available_margin_pools?: string[];
  note?: string;
};

function buildMarginReadClient(
  walletAddress: string,
  marginManagerAddress: string,
  poolKey: string,
): DeepBookClient {
  const { coins, pools } = getDeepBookEnv();
  const client = getSuiClient().$extend(
    deepbook({
      address: walletAddress,
      marginManagers: {
        [DEFAULT_MARGIN_MANAGER_SDK_KEY]: { address: marginManagerAddress, poolKey },
      },
      coins,
      pools,
    }),
  );
  return (client as unknown as { deepbook: DeepBookClient }).deepbook;
}

export function poolKeyFromDeepBookPoolAddress(poolAddress: string): string | null {
  const env = getDeepBookEnv();
  const normalized = normalizeSuiAddress(poolAddress);
  for (const [key, pool] of Object.entries(env.pools)) {
    const address = (pool as { address?: string }).address;
    if (address && normalizeSuiAddress(address) === normalized) {
      return key;
    }
  }
  return null;
}

export async function resolvePoolKeyForMarginManagerAddress(
  marginManagerAddress: string,
): Promise<string> {
  const res = await getSuiClient().getObject({
    objectId: marginManagerAddress,
    include: { content: true },
  });

  if (!res.object?.content) {
    throw new AppError(
      404,
      "MARGIN_MANAGER_NOT_FOUND",
      `Margin manager object not found: ${marginManagerAddress}`,
    );
  }

  const parsed = MarginManagerObjectFields.parse(res.object.content);
  const poolKey = poolKeyFromDeepBookPoolAddress(parsed.deepbook_pool);
  if (!poolKey) {
    throw new AppError(
      404,
      "MARGIN_POOL_KEY_UNKNOWN",
      `Could not map margin manager deepbook pool ${parsed.deepbook_pool} to a known pool key.`,
    );
  }

  return poolKey;
}

function serializeBigInt(value: bigint): string {
  return value.toString();
}

export async function fetchMarginManagerLiveState(
  walletAddress: string,
  marginManagerAddress: string,
  poolKey: string,
): Promise<MarginManagerLiveState> {
  const client = buildMarginReadClient(walletAddress, marginManagerAddress, poolKey);
  const sdkKey = DEFAULT_MARGIN_MANAGER_SDK_KEY;
  const poolConfig = MARGIN_POOL_CONFIGS[poolKey];

  const [
    state,
    baseBalance,
    quoteBalance,
    deepBalance,
    borrowedBaseShares,
    borrowedQuoteShares,
    hasBaseDebt,
    owner,
    deepbookPool,
    marginPoolId,
  ] = await Promise.all([
    client.getMarginManagerState(sdkKey),
    client.getMarginManagerBaseBalance(sdkKey),
    client.getMarginManagerQuoteBalance(sdkKey),
    client.getMarginManagerDeepBalance(sdkKey),
    client.getMarginManagerBorrowedBaseShares(sdkKey),
    client.getMarginManagerBorrowedQuoteShares(sdkKey),
    client.getMarginManagerHasBaseDebt(sdkKey),
    client.getMarginManagerOwner(sdkKey),
    client.getMarginManagerDeepbookPool(sdkKey),
    client.getMarginManagerMarginPoolId(sdkKey),
  ]);

  return {
    pool_key: poolKey,
    owner,
    deepbook_pool: deepbookPool,
    margin_pool_id: marginPoolId,
    risk_ratio: state.riskRatio,
    base_asset: state.baseAsset,
    quote_asset: state.quoteAsset,
    base_debt: state.baseDebt,
    quote_debt: state.quoteDebt,
    base_balance: baseBalance,
    quote_balance: quoteBalance,
    deep_balance: deepBalance,
    borrowed_base_shares: borrowedBaseShares,
    borrowed_quote_shares: borrowedQuoteShares,
    has_base_debt: hasBaseDebt,
    base_pyth_price: state.basePythPrice,
    base_pyth_decimals: state.basePythDecimals,
    quote_pyth_price: state.quotePythPrice,
    quote_pyth_decimals: state.quotePythDecimals,
    current_price: serializeBigInt(state.currentPrice),
    lowest_trigger_above_price: serializeBigInt(state.lowestTriggerAbovePrice),
    highest_trigger_below_price: serializeBigInt(state.highestTriggerBelowPrice),
    max_leverage: poolConfig?.maxLeverage ?? getMaxLeverage(poolKey),
    liquidation_ratio: poolConfig?.liquidationRatio ?? getLiquidationThreshold(poolKey),
    borrow_threshold: poolConfig?.borrowThreshold ?? 1.25,
  };
}

function resolveMarginManagerAddress(
  params: Record<string, unknown>,
  managerIds: string[],
): string {
  const raw =
    params.margin_manager_address ??
    params.marginManagerAddress ??
    params.manager_address;

  if (typeof raw === "string" && raw.startsWith("0x")) {
    return raw;
  }

  return managerIds[0];
}

function resolvePoolKeyParam(params: Record<string, unknown>): string | undefined {
  const raw = params.pool_key ?? params.poolKey;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return undefined;
  }
  return raw.trim().toUpperCase();
}

export async function queryMarginManagerInfo(
  privyUserId: string,
  params: Record<string, unknown> = {},
): Promise<MarginManagerInfoQueryResult> {
  const marginEnabledPools = getMarginEnabledPoolKeys();
  const marginWallet = await resolveAgentWalletByPrivyUserId(privyUserId, "sui");

  if (!marginWallet) {
    return {
      provisioned: false,
      note: "No Sui agent wallet found. The user needs to set up their wallet first.",
      available_margin_pools: marginEnabledPools,
    };
  }

  const lookup = await resolveMarginManagerIdsForUser(privyUserId, marginWallet.address);
  const marginManagerIds = lookup.margin_manager_ids;

  if (marginManagerIds.length === 0) {
    return {
      provisioned: false,
      note: "No margin manager found on-chain. Create one with execute_transaction action deepbook_provision_margin_manager {}.",
      available_margin_pools: marginEnabledPools,
    };
  }

  const marginManagerAddress = resolveMarginManagerAddress(params, marginManagerIds);
  const poolKeyParam = resolvePoolKeyParam(params);
  let poolKey: string;

  try {
    poolKey =
      poolKeyParam ??
      (await resolvePoolKeyForMarginManagerAddress(marginManagerAddress));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      provisioned: true,
      margin_manager_key: "default",
      margin_manager_address: marginManagerAddress,
      manager_count: marginManagerIds.length,
      lookup_source: lookup.source,
      ...(lookup.rpc_warning ? { rpc_warning: lookup.rpc_warning } : {}),
      available_margin_pools: marginEnabledPools,
      live_state_error: message,
      note:
        "Margin manager exists on-chain but live pool/state lookup failed. " +
        "Share margin_manager_address with the user; retry margin_manager_info shortly.",
    };
  }

  let liveState: MarginManagerLiveState | undefined;
  let liveStateError: string | undefined;

  try {
    liveState = await fetchMarginManagerLiveState(
      marginWallet.address,
      marginManagerAddress,
      poolKey,
    );
  } catch (err) {
    liveStateError = err instanceof Error ? err.message : String(err);
  }

  return {
    provisioned: true,
    margin_manager_key: "default",
    margin_manager_address: marginManagerAddress,
    manager_count: marginManagerIds.length,
    lookup_source: lookup.source,
    ...(lookup.rpc_warning ? { rpc_warning: lookup.rpc_warning } : {}),
    ...(liveState ? { live_state: liveState } : {}),
    ...(liveStateError ? { live_state_error: liveStateError } : {}),
    available_margin_pools: marginEnabledPools,
    note:
      lookup.source === "agent_ledger_fallback"
        ? "Margin manager address recovered from your recent executed agent transaction because live Sui RPC lookup failed. Use margin_manager_key \"default\" for follow-up margin actions."
        : liveState
          ? `Margin manager on ${liveState.pool_key}: risk ratio ${liveState.risk_ratio.toFixed(4)}. Use margin_manager_key \"default\" for margin actions.`
          : "Margin manager exists on-chain. Live balances/risk could not be fetched — share margin_manager_address and retry shortly.",
  };
}

/** Test hook — pure formatter used by summarize-query-chain. */
export function formatMarginManagerLiveStateSummary(live: MarginManagerLiveState): string {
  const debtSide = live.has_base_debt ? "base" : "quote";
  const debtAmount = live.has_base_debt ? live.base_debt : live.quote_debt;
  const parts = [
    `pool ${live.pool_key}`,
    `risk ratio ${live.risk_ratio.toFixed(4)}`,
    `collateral base ${live.base_balance} / quote ${live.quote_balance} / DEEP ${live.deep_balance}`,
  ];

  if (Number(debtAmount) > 0) {
    parts.push(`debt ${debtAmount} (${debtSide})`);
  } else {
    parts.push("no open debt");
  }

  parts.push(
    `assets base ${live.base_asset} / quote ${live.quote_asset}`,
    `liquidation threshold ${live.liquidation_ratio}`,
  );

  return parts.join("; ");
}
