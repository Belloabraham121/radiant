import { MAX_TIMESTAMP } from "@mysten/deepbook-v3";
import { Transaction } from "@mysten/sui/transactions";
import { getDeepBookEnv } from "../../../config/deepbook.js";
import { AppError } from "../../../errors/app-error.js";
import { getSuiClient } from "../../../infrastructure/sui/client.js";
import { getPrivyClient } from "../../../infrastructure/privy/client.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import { executeSignedSuiTransaction } from "../../wallet/sui-transaction.service.js";
import { signSuiTransactionBytes } from "../../wallet/sui-signing.service.js";
import {
  ensureBalanceManager,
} from "./deepbook-balance-manager.service.js";
import type { ProvisionedDeepBookManager } from "./deepbook-balance-manager.types.js";
import { getDeepBookPoolInfo } from "./deepbook-pools.service.js";
import { fetchIndexerOrders } from "./indexer/deepbook-indexer.client.js";
import { normalizePoolKey } from "./pool-key.js";
import { isMultipleOfStep } from "./order-constraints.js";
import {
  getDeepBookClient,
  getSuiDeepBookClient,
  type SuiDeepBookExtendedClient,
} from "./providers/sui-deepbook.provider.js";
import type { DeepBookClientContext, OrderSummary } from "./types.js";
import type { TxResult } from "../../chains/types.js";

const LIMIT_ORDER_ACTION = "deepbook_place_limit_order";
const MARKET_ORDER_ACTION = "deepbook_place_market_order";
const CANCEL_ORDER_ACTION = "deepbook_cancel_order";
const CANCEL_ORDERS_ACTION = "deepbook_cancel_orders";
const CANCEL_ALL_ACTION = "deepbook_cancel_all_orders";
const MODIFY_ORDER_ACTION = "deepbook_modify_order";
const WITHDRAW_SETTLED_ACTION = "deepbook_withdraw_settled_amounts";
const WITHDRAW_SETTLED_PERM_ACTION = "deepbook_withdraw_settled_amounts_permissionless";

const PLACE_ORDER_ACTIONS = new Set([LIMIT_ORDER_ACTION, MARKET_ORDER_ACTION]);
const CANCEL_ORDER_ACTIONS = new Set([
  CANCEL_ORDER_ACTION,
  CANCEL_ORDERS_ACTION,
  CANCEL_ALL_ACTION,
]);
const SETTLED_ACTIONS = new Set([WITHDRAW_SETTLED_ACTION, WITHDRAW_SETTLED_PERM_ACTION]);
const ORDER_ACTIONS = new Set([
  ...PLACE_ORDER_ACTIONS,
  ...CANCEL_ORDER_ACTIONS,
  MODIFY_ORDER_ACTION,
  ...SETTLED_ACTIONS,
]);

export type DeepBookLimitOrderParams = {
  pool_key: string;
  price: number;
  quantity: number;
  is_bid: boolean;
  pay_with_deep: boolean;
  client_order_id: number;
  expiration: number;
};

export type DeepBookMarketOrderParams = {
  pool_key: string;
  quantity: number;
  is_bid: boolean;
  pay_with_deep: boolean;
  client_order_id: number;
};

export type DeepBookCancelOrderParams = {
  pool_key: string;
  order_id: string;
};

export type DeepBookCancelAllOrdersParams = {
  pool_key: string;
};

export type DeepBookCancelOrdersParams = {
  pool_key: string;
  order_ids: string[];
};

export type DeepBookModifyOrderParams = {
  pool_key: string;
  order_id: string;
  quantity: number;
};

export type DeepBookWithdrawSettledParams = {
  pool_key: string;
};

export type DeepBookOpenOrdersResult = {
  pool_key: string;
  manager_key: string;
  manager_object_id: string;
  orders: OrderSummary[];
  source: "sdk" | "sdk+indexer";
};

export type DeepBookOrderTxResult = TxResult & {
  pool_key: string;
  action: string;
  order_id?: string;
  client_order_id?: number;
  price?: number;
  quantity?: number;
  is_bid?: boolean;
  pay_with_deep?: boolean;
  cancelled_count?: number;
};

type PoolCoins = {
  pool_key: string;
  base_coin: string;
  quote_coin: string;
};

let executeSignedTx = executeSignedSuiTransaction;
let signTxBytes = signSuiTransactionBytes;
let fetchPrivyWallet = async (privyWalletId: string) => {
  const wallet = await getPrivyClient().wallets().get(privyWalletId);
  if (!wallet.public_key) {
    throw new AppError(
      502,
      "WALLET_METADATA_MISSING",
      "Privy Sui wallet is missing a public key — cannot serialize signatures",
    );
  }
  return wallet;
};

function assertPoolKey(poolKey: string): PoolCoins {
  const normalized = normalizePoolKey(poolKey);
  const { pools } = getDeepBookEnv();
  const pool = pools[normalized as keyof typeof pools];
  if (!pool) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `Unknown DeepBook pool "${poolKey}". Call query_chain deepbook_pools for the full list. ` +
        `Known pools include ${Object.keys(pools).join(", ")}.`,
    );
  }
  return { pool_key: normalized, base_coin: pool.baseCoin, quote_coin: pool.quoteCoin };
}

function readPositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/,/g, "");
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function parseQuantity(params: Record<string, unknown>): number {
  for (const key of ["quantity", "amount", "amount_display", "size"]) {
    const value = readPositiveNumber(params[key]);
    if (value !== null) return value;
  }
  throw new AppError(
    400,
    "VALIDATION_ERROR",
    "params.quantity (or amount / amount_display) must be a positive number",
  );
}

function parsePrice(params: Record<string, unknown>): number {
  const value = readPositiveNumber(params.price);
  if (value === null) {
    throw new AppError(400, "VALIDATION_ERROR", "params.price must be a positive number");
  }
  return value;
}

function parseClientOrderId(params: Record<string, unknown>): number {
  const raw = params.client_order_id ?? params.clientOrderId;
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) {
    return raw;
  }
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    return Number(raw);
  }
  return Date.now() % 9_007_199_254_740_991;
}

function parseExpiration(params: Record<string, unknown>): number {
  const raw = params.expiration ?? params.expire_timestamp ?? params.expiration_timestamp;
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
    return raw;
  }
  return Number(MAX_TIMESTAMP);
}

function resolveIsBid(params: Record<string, unknown>, pool: PoolCoins): boolean {
  if (params.is_bid === true || params.is_bid === "true") return true;
  if (params.is_bid === false || params.is_bid === "false") return false;

  const side = params.side;
  if (side === "buy") return true;
  if (side === "sell") return false;

  const orderSide = params.order_side;
  if (orderSide === "buy" || orderSide === "bid") return true;
  if (orderSide === "sell" || orderSide === "ask") return false;

  throw new AppError(
    400,
    "VALIDATION_ERROR",
    'params.side must be "buy" or "sell", or pass is_bid: true|false (buy = bid, sell = ask)',
  );
}

function parsePoolKeyParam(params: Record<string, unknown>): string {
  const { defaultPool } = getDeepBookEnv();
  return typeof params.pool_key === "string" && params.pool_key.length > 0
    ? params.pool_key
    : defaultPool;
}

export function isDeepBookOrderAction(action: string): boolean {
  return ORDER_ACTIONS.has(action);
}

export function isDeepBookPlaceOrderAction(action: string): boolean {
  return PLACE_ORDER_ACTIONS.has(action);
}

export function isDeepBookCancelOrderAction(action: string): boolean {
  return CANCEL_ORDER_ACTIONS.has(action);
}

export function isDeepBookSettledWithdrawAction(action: string): boolean {
  return SETTLED_ACTIONS.has(action);
}

export function isDeepBookModifyOrderAction(action: string): boolean {
  return action === MODIFY_ORDER_ACTION;
}

export function parseDeepBookLimitOrderParams(
  params: Record<string, unknown>,
): DeepBookLimitOrderParams {
  const pool = assertPoolKey(parsePoolKeyParam(params));
  return {
    pool_key: pool.pool_key,
    price: parsePrice(params),
    quantity: parseQuantity(params),
    is_bid: resolveIsBid(params, pool),
    pay_with_deep: params.pay_with_deep === true,
    client_order_id: parseClientOrderId(params),
    expiration: parseExpiration(params),
  };
}

export function parseDeepBookMarketOrderParams(
  params: Record<string, unknown>,
): DeepBookMarketOrderParams {
  const pool = assertPoolKey(parsePoolKeyParam(params));
  return {
    pool_key: pool.pool_key,
    quantity: parseQuantity(params),
    is_bid: resolveIsBid(params, pool),
    pay_with_deep: params.pay_with_deep === true,
    client_order_id: parseClientOrderId(params),
  };
}

export function parseDeepBookCancelOrderParams(
  params: Record<string, unknown>,
): DeepBookCancelOrderParams {
  const pool = assertPoolKey(parsePoolKeyParam(params));
  const orderId = params.order_id ?? params.orderId;
  if (typeof orderId !== "string" || orderId.trim().length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "params.order_id is required");
  }
  return { pool_key: pool.pool_key, order_id: orderId.trim() };
}

export function parseDeepBookCancelAllOrdersParams(
  params: Record<string, unknown>,
): DeepBookCancelAllOrdersParams {
  return { pool_key: assertPoolKey(parsePoolKeyParam(params)).pool_key };
}

function parseOrderIdList(params: Record<string, unknown>): string[] {
  const raw = params.order_ids ?? params.orderIds;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "params.order_ids must be a non-empty array of order IDs",
    );
  }
  const orderIds = raw
    .map((id) => (typeof id === "string" || typeof id === "number" ? String(id).trim() : ""))
    .filter((id) => id.length > 0);
  if (orderIds.length === 0) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "params.order_ids must contain at least one valid order ID",
    );
  }
  return orderIds;
}

export function parseDeepBookCancelOrdersParams(
  params: Record<string, unknown>,
): DeepBookCancelOrdersParams {
  const pool = assertPoolKey(parsePoolKeyParam(params));
  return { pool_key: pool.pool_key, order_ids: parseOrderIdList(params) };
}

export function parseDeepBookModifyOrderParams(
  params: Record<string, unknown>,
): DeepBookModifyOrderParams {
  const pool = assertPoolKey(parsePoolKeyParam(params));
  const orderId = params.order_id ?? params.orderId;
  if (typeof orderId !== "string" || orderId.trim().length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "params.order_id is required");
  }
  return {
    pool_key: pool.pool_key,
    order_id: orderId.trim(),
    quantity: parseQuantity(params),
  };
}

export function parseDeepBookWithdrawSettledParams(
  params: Record<string, unknown>,
): DeepBookWithdrawSettledParams {
  return { pool_key: assertPoolKey(parsePoolKeyParam(params)).pool_key };
}

/** Estimate order size in SUI for auto-approve thresholds (base quantity on SUI pools). */
export function estimateOrderNotionalSui(
  pool: PoolCoins,
  quantity: number,
  price: number | null,
  isBid: boolean,
  suiPerQuote: number | null,
): number {
  if (pool.base_coin.toUpperCase() === "SUI") {
    return quantity;
  }
  if (pool.quote_coin.toUpperCase() === "SUI" && price && price > 0) {
    return isBid ? quantity / price : quantity * price;
  }
  if (suiPerQuote && suiPerQuote > 0 && price && price > 0) {
    const quoteLocked = isBid ? quantity * price : quantity;
    return quoteLocked / suiPerQuote;
  }
  return quantity;
}

function mapBuildError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  if (/insufficient\s*balance|insufficientcoinbalance|not enough/i.test(message)) {
    throw new AppError(400, "INSUFFICIENT_BALANCE", message);
  }
  if (err instanceof AppError) {
    throw err;
  }
  throw err;
}

async function resolveSuiAgentWallet(privyUserId: string) {
  const wallet = await resolveAgentWalletByPrivyUserId(privyUserId, "sui");
  if (!wallet) {
    throw new AppError(404, "WALLET_NOT_FOUND", "No Sui agent wallet registered.");
  }
  if (!wallet.signer_added) {
    throw new AppError(
      403,
      "WALLET_SIGNER_NOT_CONFIGURED",
      "Session signer has not been added to the agent wallet",
    );
  }
  return wallet;
}

function toClientContext(
  walletAddress: string,
  manager: ProvisionedDeepBookManager,
): DeepBookClientContext {
  return {
    address: walletAddress,
    balanceManagers: {
      [manager.manager_key]: {
        address: manager.manager_object_id,
        ...(manager.trade_cap_id ? { tradeCap: manager.trade_cap_id } : {}),
      },
    },
  };
}

async function validateLimitOrderSize(
  privyUserId: string,
  parsed: DeepBookLimitOrderParams,
  pool: PoolCoins,
): Promise<void> {
  const info = await getDeepBookPoolInfo(parsed.pool_key, privyUserId);
  if (info.on_chain) {
    const { min_size, lot_size, tick_size } = info.on_chain;
    if (parsed.quantity < min_size) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Order quantity ${parsed.quantity} ${pool.base_coin} is below pool min_size ${min_size}`,
      );
    }
    if (lot_size > 0) {
      if (!isMultipleOfStep(parsed.quantity, lot_size)) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          `Order quantity must be a multiple of lot_size ${lot_size} ${pool.base_coin}`,
        );
      }
    }
    if (tick_size > 0) {
      if (!isMultipleOfStep(parsed.price, tick_size)) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          `Order price must be a multiple of tick_size ${tick_size}`,
        );
      }
    }
  }

  const wallet = await resolveSuiAgentWallet(privyUserId);
  const manager = await ensureBalanceManager(privyUserId);
  const client = getDeepBookClient(toClientContext(wallet.address, manager));
  const valid = await client.checkLimitOrderParams(
    parsed.pool_key,
    parsed.price,
    parsed.quantity,
    parsed.expiration,
  );
  if (!valid) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Limit order params failed on-chain validation (price, quantity, tick/lot, or expiration)",
    );
  }
}

async function validateModifyOrderSize(
  privyUserId: string,
  parsed: DeepBookModifyOrderParams,
  pool: PoolCoins,
): Promise<void> {
  const info = await getDeepBookPoolInfo(parsed.pool_key, privyUserId);
  if (info.on_chain) {
    const { min_size, lot_size } = info.on_chain;
    if (parsed.quantity < min_size) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Modified quantity ${parsed.quantity} ${pool.base_coin} is below pool min_size ${min_size}`,
      );
    }
    if (lot_size > 0 && !isMultipleOfStep(parsed.quantity, lot_size)) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Modified quantity must be a multiple of lot_size ${lot_size} ${pool.base_coin}`,
      );
    }
  }
}

async function validateMarketOrderSize(
  privyUserId: string,
  parsed: DeepBookMarketOrderParams,
  pool: PoolCoins,
): Promise<void> {
  const info = await getDeepBookPoolInfo(parsed.pool_key, privyUserId);
  if (info.on_chain && parsed.quantity < info.on_chain.min_size) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `Order quantity ${parsed.quantity} ${pool.base_coin} is below pool min_size ${info.on_chain.min_size}`,
    );
  }

  const wallet = await resolveSuiAgentWallet(privyUserId);
  const manager = await ensureBalanceManager(privyUserId);
  const client = getDeepBookClient(toClientContext(wallet.address, manager));
  const valid = await client.checkMarketOrderParams(parsed.pool_key, parsed.quantity);
  if (!valid) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Market order quantity failed on-chain validation (lot/min size)",
    );
  }
}

async function buildAndExecuteOrderTransaction(
  privyUserId: string,
  build: (
    tx: Transaction,
    client: SuiDeepBookExtendedClient,
    manager: ProvisionedDeepBookManager,
  ) => void,
): Promise<TxResult> {
  const agentWallet = await resolveSuiAgentWallet(privyUserId);
  const manager = await ensureBalanceManager(privyUserId);
  const privyWallet = await fetchPrivyWallet(agentWallet.privy_wallet_id);

  const tx = new Transaction();
  tx.setSender(agentWallet.address);

  const extended = getSuiDeepBookClient(toClientContext(agentWallet.address, manager));
  build(tx, extended, manager);

  let transactionBytes: Uint8Array;
  try {
    transactionBytes = await tx.build({ client: getSuiClient() });
  } catch (err) {
    mapBuildError(err);
  }

  const serializedSignature = await signTxBytes({
    privyWalletId: agentWallet.privy_wallet_id,
    suiAddress: agentWallet.address,
    publicKeyBase58: privyWallet.public_key!,
    transactionBytes,
  });

  const result = await executeSignedTx({
    transactionBytes,
    serializedSignature,
    suiAddress: agentWallet.address,
  });

  return {
    chain_id: "sui",
    digest: result.digest,
    address: result.sui_address,
    effects_status: result.effects_status,
  };
}

function mapSdkStatus(status: number): OrderSummary["status"] {
  if (status === 1) return "filled";
  if (status === 2) return "cancelled";
  return "open";
}

function mapIndexerStatus(status: string): OrderSummary["status"] {
  const normalized = status.toLowerCase();
  if (normalized.includes("fill")) return "filled";
  if (normalized.includes("cancel")) return "cancelled";
  return "open";
}

async function mapOrderDetailsToSummaries(
  poolKey: string,
  client: ReturnType<typeof getDeepBookClient>,
  rawOrders: Array<{ order_id: string | bigint | number }>,
): Promise<OrderSummary[]> {
  const summaries: OrderSummary[] = [];

  for (const raw of rawOrders) {
    const orderId = String(raw.order_id);
    const normalized = await client.getOrderNormalized(poolKey, orderId);
    if (!normalized) continue;

    const quantity = Number(normalized.quantity);
    const filled = Number(normalized.filled_quantity);
    summaries.push({
      order_id: orderId,
      pool_key: poolKey,
      client_order_id: String(normalized.client_order_id),
      price: Number(normalized.normalized_price),
      quantity,
      remaining_quantity: Math.max(0, quantity - filled),
      is_bid: normalized.isBid,
      status: mapSdkStatus(normalized.status),
    });
  }

  return summaries;
}

export async function getDeepBookOpenOrders(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<DeepBookOpenOrdersResult> {
  const pool = assertPoolKey(parsePoolKeyParam(params));
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const manager = await ensureBalanceManager(privyUserId);
  const ctx = toClientContext(wallet.address, manager);
  const client = getDeepBookClient(ctx);

  const rawOrders = await client.getAccountOrderDetails(pool.pool_key, manager.manager_key);
  let orders = await mapOrderDetailsToSummaries(pool.pool_key, client, rawOrders);
  let source: DeepBookOpenOrdersResult["source"] = "sdk";

  try {
    const indexerOrders = await fetchIndexerOrders(pool.pool_key, manager.manager_object_id, {
      status: "Placed",
      limit: 100,
    });
    if (indexerOrders.length > 0) {
      const byId = new Map(orders.map((order) => [order.order_id, order]));
      for (const row of indexerOrders) {
        if (!byId.has(row.order_id)) {
          byId.set(row.order_id, {
            order_id: row.order_id,
            pool_key: pool.pool_key,
            client_order_id: row.order_id,
            price: row.price,
            quantity: row.original_quantity,
            remaining_quantity: row.remaining_quantity,
            is_bid: row.type.toLowerCase().includes("bid"),
            status: mapIndexerStatus(row.current_status),
          });
        }
      }
      orders = [...byId.values()];
      source = "sdk+indexer";
    }
  } catch {
    // Indexer enrichment is optional — SDK result is authoritative for open orders.
  }

  orders.sort((a, b) => b.price - a.price);

  return {
    pool_key: pool.pool_key,
    manager_key: manager.manager_key,
    manager_object_id: manager.manager_object_id,
    orders,
    source,
  };
}

export async function executeDeepBookPlaceLimitOrder(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<DeepBookOrderTxResult> {
  const parsed = parseDeepBookLimitOrderParams(params);
  const pool = assertPoolKey(parsed.pool_key);
  await validateLimitOrderSize(privyUserId, parsed, pool);

  const result = await buildAndExecuteOrderTransaction(privyUserId, (tx, client, manager) => {
    tx.add(
      client.deepbook.deepBook.placeLimitOrder({
        poolKey: parsed.pool_key,
        balanceManagerKey: manager.manager_key,
        clientOrderId: String(parsed.client_order_id),
        price: parsed.price,
        quantity: parsed.quantity,
        isBid: parsed.is_bid,
        payWithDeep: parsed.pay_with_deep,
        expiration: parsed.expiration,
      }),
    );
  });

  return {
    ...result,
    pool_key: parsed.pool_key,
    action: LIMIT_ORDER_ACTION,
    client_order_id: parsed.client_order_id,
    price: parsed.price,
    quantity: parsed.quantity,
    is_bid: parsed.is_bid,
    pay_with_deep: parsed.pay_with_deep,
  };
}

export async function executeDeepBookPlaceMarketOrder(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<DeepBookOrderTxResult> {
  const parsed = parseDeepBookMarketOrderParams(params);
  const pool = assertPoolKey(parsed.pool_key);
  await validateMarketOrderSize(privyUserId, parsed, pool);

  const result = await buildAndExecuteOrderTransaction(privyUserId, (tx, client, manager) => {
    tx.add(
      client.deepbook.deepBook.placeMarketOrder({
        poolKey: parsed.pool_key,
        balanceManagerKey: manager.manager_key,
        clientOrderId: String(parsed.client_order_id),
        quantity: parsed.quantity,
        isBid: parsed.is_bid,
        payWithDeep: parsed.pay_with_deep,
      }),
    );
  });

  return {
    ...result,
    pool_key: parsed.pool_key,
    action: MARKET_ORDER_ACTION,
    client_order_id: parsed.client_order_id,
    quantity: parsed.quantity,
    is_bid: parsed.is_bid,
    pay_with_deep: parsed.pay_with_deep,
  };
}

export async function executeDeepBookCancelOrder(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<DeepBookOrderTxResult> {
  const parsed = parseDeepBookCancelOrderParams(params);

  const result = await buildAndExecuteOrderTransaction(privyUserId, (tx, client, manager) => {
    tx.add(
      client.deepbook.deepBook.cancelOrder(
        parsed.pool_key,
        manager.manager_key,
        parsed.order_id,
      ),
    );
  });

  return {
    ...result,
    pool_key: parsed.pool_key,
    action: CANCEL_ORDER_ACTION,
    order_id: parsed.order_id,
    cancelled_count: 1,
  };
}

export async function executeDeepBookCancelAllOrders(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<DeepBookOrderTxResult> {
  const parsed = parseDeepBookCancelAllOrdersParams(params);
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const manager = await ensureBalanceManager(privyUserId);
  const client = getDeepBookClient(toClientContext(wallet.address, manager));
  const openBefore = await client.accountOpenOrders(parsed.pool_key, manager.manager_key);

  const result = await buildAndExecuteOrderTransaction(privyUserId, (tx, client, manager) => {
    tx.add(client.deepbook.deepBook.cancelAllOrders(parsed.pool_key, manager.manager_key));
  });

  return {
    ...result,
    pool_key: parsed.pool_key,
    action: CANCEL_ALL_ACTION,
    cancelled_count: openBefore.length,
  };
}

export async function executeDeepBookCancelOrders(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<DeepBookOrderTxResult> {
  const parsed = parseDeepBookCancelOrdersParams(params);

  const result = await buildAndExecuteOrderTransaction(privyUserId, (tx, client, manager) => {
    tx.add(
      client.deepbook.deepBook.cancelOrders(
        parsed.pool_key,
        manager.manager_key,
        parsed.order_ids,
      ),
    );
  });

  return {
    ...result,
    pool_key: parsed.pool_key,
    action: CANCEL_ORDERS_ACTION,
    cancelled_count: parsed.order_ids.length,
  };
}

export async function executeDeepBookModifyOrder(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<DeepBookOrderTxResult> {
  const parsed = parseDeepBookModifyOrderParams(params);
  const pool = assertPoolKey(parsed.pool_key);
  await validateModifyOrderSize(privyUserId, parsed, pool);

  const result = await buildAndExecuteOrderTransaction(privyUserId, (tx, client, manager) => {
    tx.add(
      client.deepbook.deepBook.modifyOrder(
        parsed.pool_key,
        manager.manager_key,
        parsed.order_id,
        parsed.quantity,
      ),
    );
  });

  return {
    ...result,
    pool_key: parsed.pool_key,
    action: MODIFY_ORDER_ACTION,
    order_id: parsed.order_id,
    quantity: parsed.quantity,
  };
}

export async function executeDeepBookWithdrawSettledAmounts(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<DeepBookOrderTxResult> {
  const parsed = parseDeepBookWithdrawSettledParams(params);

  const result = await buildAndExecuteOrderTransaction(privyUserId, (tx, client, manager) => {
    tx.add(
      client.deepbook.deepBook.withdrawSettledAmounts(parsed.pool_key, manager.manager_key),
    );
  });

  return {
    ...result,
    pool_key: parsed.pool_key,
    action: WITHDRAW_SETTLED_ACTION,
  };
}

export async function executeDeepBookWithdrawSettledAmountsPermissionless(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<DeepBookOrderTxResult> {
  const parsed = parseDeepBookWithdrawSettledParams(params);

  const result = await buildAndExecuteOrderTransaction(privyUserId, (tx, client, manager) => {
    tx.add(
      client.deepbook.deepBook.withdrawSettledAmountsPermissionless(
        parsed.pool_key,
        manager.manager_key,
      ),
    );
  });

  return {
    ...result,
    pool_key: parsed.pool_key,
    action: WITHDRAW_SETTLED_PERM_ACTION,
  };
}

export async function executeDeepBookOrderAction(
  action: string,
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<DeepBookOrderTxResult> {
  switch (action) {
    case LIMIT_ORDER_ACTION:
      return executeDeepBookPlaceLimitOrder(privyUserId, params);
    case MARKET_ORDER_ACTION:
      return executeDeepBookPlaceMarketOrder(privyUserId, params);
    case CANCEL_ORDER_ACTION:
      return executeDeepBookCancelOrder(privyUserId, params);
    case CANCEL_ORDERS_ACTION:
      return executeDeepBookCancelOrders(privyUserId, params);
    case CANCEL_ALL_ACTION:
      return executeDeepBookCancelAllOrders(privyUserId, params);
    case MODIFY_ORDER_ACTION:
      return executeDeepBookModifyOrder(privyUserId, params);
    case WITHDRAW_SETTLED_ACTION:
      return executeDeepBookWithdrawSettledAmounts(privyUserId, params);
    case WITHDRAW_SETTLED_PERM_ACTION:
      return executeDeepBookWithdrawSettledAmountsPermissionless(privyUserId, params);
    default:
      throw new AppError(400, "UNSUPPORTED_ACTION", `Unsupported DeepBook order action: ${action}`);
  }
}

/** Dry-run order PTB build before queueing approval. */
export async function preflightDeepBookPlaceLimitOrder(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<void> {
  const parsed = parseDeepBookLimitOrderParams(params);
  const pool = assertPoolKey(parsed.pool_key);
  await validateLimitOrderSize(privyUserId, parsed, pool);
  await buildDeepBookLimitOrderTransactionBytes(privyUserId, params);
}

export async function preflightDeepBookPlaceMarketOrder(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<void> {
  const parsed = parseDeepBookMarketOrderParams(params);
  const pool = assertPoolKey(parsed.pool_key);
  await validateMarketOrderSize(privyUserId, parsed, pool);
  await buildDeepBookMarketOrderTransactionBytes(privyUserId, params);
}

export async function preflightDeepBookModifyOrder(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<void> {
  const parsed = parseDeepBookModifyOrderParams(params);
  const pool = assertPoolKey(parsed.pool_key);
  await validateModifyOrderSize(privyUserId, parsed, pool);
  await buildDeepBookModifyOrderTransactionBytes(privyUserId, params);
}

export async function preflightDeepBookWithdrawSettled(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<void> {
  parseDeepBookWithdrawSettledParams(params);
  await buildDeepBookWithdrawSettledTransactionBytes(privyUserId, params);
}

export async function preflightDeepBookWithdrawSettledPermissionless(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<void> {
  parseDeepBookWithdrawSettledParams(params);
  await buildDeepBookWithdrawSettledPermissionlessTransactionBytes(privyUserId, params);
}

export async function buildDeepBookLimitOrderTransactionBytes(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<Uint8Array> {
  const parsed = parseDeepBookLimitOrderParams(params);
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const manager = await ensureBalanceManager(privyUserId);

  const tx = new Transaction();
  tx.setSender(wallet.address);
  const extended = getSuiDeepBookClient(toClientContext(wallet.address, manager));
  tx.add(
    extended.deepbook.deepBook.placeLimitOrder({
      poolKey: parsed.pool_key,
      balanceManagerKey: manager.manager_key,
      clientOrderId: String(parsed.client_order_id),
      price: parsed.price,
      quantity: parsed.quantity,
      isBid: parsed.is_bid,
      payWithDeep: parsed.pay_with_deep,
      expiration: parsed.expiration,
    }),
  );

  try {
    return await tx.build({ client: getSuiClient() });
  } catch (err) {
    mapBuildError(err);
  }
}

export async function buildDeepBookMarketOrderTransactionBytes(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<Uint8Array> {
  const parsed = parseDeepBookMarketOrderParams(params);
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const manager = await ensureBalanceManager(privyUserId);

  const tx = new Transaction();
  tx.setSender(wallet.address);
  const extended = getSuiDeepBookClient(toClientContext(wallet.address, manager));
  tx.add(
    extended.deepbook.deepBook.placeMarketOrder({
      poolKey: parsed.pool_key,
      balanceManagerKey: manager.manager_key,
      clientOrderId: String(parsed.client_order_id),
      quantity: parsed.quantity,
      isBid: parsed.is_bid,
      payWithDeep: parsed.pay_with_deep,
    }),
  );

  try {
    return await tx.build({ client: getSuiClient() });
  } catch (err) {
    mapBuildError(err);
  }
}

export async function buildDeepBookModifyOrderTransactionBytes(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<Uint8Array> {
  const parsed = parseDeepBookModifyOrderParams(params);
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const manager = await ensureBalanceManager(privyUserId);

  const tx = new Transaction();
  tx.setSender(wallet.address);
  const extended = getSuiDeepBookClient(toClientContext(wallet.address, manager));
  tx.add(
    extended.deepbook.deepBook.modifyOrder(
      parsed.pool_key,
      manager.manager_key,
      parsed.order_id,
      parsed.quantity,
    ),
  );

  try {
    return await tx.build({ client: getSuiClient() });
  } catch (err) {
    mapBuildError(err);
  }
}

export async function buildDeepBookWithdrawSettledTransactionBytes(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<Uint8Array> {
  const parsed = parseDeepBookWithdrawSettledParams(params);
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const manager = await ensureBalanceManager(privyUserId);

  const tx = new Transaction();
  tx.setSender(wallet.address);
  const extended = getSuiDeepBookClient(toClientContext(wallet.address, manager));
  tx.add(
    extended.deepbook.deepBook.withdrawSettledAmounts(parsed.pool_key, manager.manager_key),
  );

  try {
    return await tx.build({ client: getSuiClient() });
  } catch (err) {
    mapBuildError(err);
  }
}

export async function buildDeepBookWithdrawSettledPermissionlessTransactionBytes(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<Uint8Array> {
  const parsed = parseDeepBookWithdrawSettledParams(params);
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const manager = await ensureBalanceManager(privyUserId);

  const tx = new Transaction();
  tx.setSender(wallet.address);
  const extended = getSuiDeepBookClient(toClientContext(wallet.address, manager));
  tx.add(
    extended.deepbook.deepBook.withdrawSettledAmountsPermissionless(
      parsed.pool_key,
      manager.manager_key,
    ),
  );

  try {
    return await tx.build({ client: getSuiClient() });
  } catch (err) {
    mapBuildError(err);
  }
}

export function estimatePlaceOrderNotionalSui(
  action: string,
  params: Record<string, unknown>,
  suiPerQuote: number | null = null,
): number {
  const pool = assertPoolKey(parsePoolKeyParam(params));
  if (action === LIMIT_ORDER_ACTION) {
    const parsed = parseDeepBookLimitOrderParams(params);
    return estimateOrderNotionalSui(pool, parsed.quantity, parsed.price, parsed.is_bid, suiPerQuote);
  }
  if (action === MARKET_ORDER_ACTION) {
    const parsed = parseDeepBookMarketOrderParams(params);
    return estimateOrderNotionalSui(pool, parsed.quantity, null, parsed.is_bid, suiPerQuote);
  }
  return 0;
}

/** Test hooks */
export function resetDeepBookOrdersServiceForTests(): void {
  executeSignedTx = executeSignedSuiTransaction;
  signTxBytes = signSuiTransactionBytes;
  fetchPrivyWallet = async (privyWalletId: string) => {
    const wallet = await getPrivyClient().wallets().get(privyWalletId);
    if (!wallet.public_key) {
      throw new AppError(502, "WALLET_METADATA_MISSING", "Missing public key");
    }
    return wallet;
  };
}
