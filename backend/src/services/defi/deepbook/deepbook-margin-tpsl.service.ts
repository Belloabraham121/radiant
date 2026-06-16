import { Transaction } from "@mysten/sui/transactions";
import { deepbook, type AddConditionalOrderParams, type DeepBookClient } from "@mysten/deepbook-v3";
import type { TxResult } from "../../chains/types.js";
import { AppError } from "../../../errors/app-error.js";
import { getDeepBookEnv } from "../../../config/deepbook.js";
import { fetchMarginManagerIdsForOwner } from "./margin-manager-lookup.service.js";
import { getSuiClient } from "../../../infrastructure/sui/client.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import { executeSignedSuiTransaction } from "../../wallet/sui-transaction.service.js";
import { signSuiTransactionBytes } from "../../wallet/sui-signing.service.js";
import { getPrivyClient } from "../../../infrastructure/privy/client.js";
import { ensureBalanceManager } from "./deepbook-balance-manager.service.js";
import type { MarginExecResult } from "./deepbook-margin-execution.service.js";
import type { ParsedMarginTpslAddParams, TpslOrderKind, TpslType } from "./deepbook-margin-tpsl.types.js";

async function resolveSuiAgentWallet(privyUserId: string) {
  const wallet = await resolveAgentWalletByPrivyUserId(privyUserId, "sui");
  if (!wallet) {
    throw new AppError(404, "WALLET_NOT_FOUND", "No Sui agent wallet registered.");
  }
  if (!wallet.signer_added) {
    throw new AppError(403, "WALLET_SIGNER_NOT_CONFIGURED", "Session signer not configured.");
  }
  return wallet;
}

function parsePositiveAmount(raw: unknown, field = "amount"): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new AppError(400, "VALIDATION_ERROR", `${field} must be a positive number (got "${raw}")`);
  }
  return n;
}

async function resolveMarginManagerKey(
  privyUserId: string,
  walletAddress: string,
  params: Record<string, unknown>,
): Promise<{ managerKey: string; marginManagerAddress: string; poolKey: string }> {
  const poolKey = String(
    params.pool_key ?? params.poolKey ?? getDeepBookEnv().defaultPool,
  ).toUpperCase();

  const rawKey = params.margin_manager_key ?? params.marginManagerKey ?? params.manager_key;
  if (typeof rawKey === "string" && rawKey.startsWith("0x")) {
    return { managerKey: "MARGIN_1", marginManagerAddress: rawKey, poolKey };
  }

  const managerIds = await fetchMarginManagerIdsForOwner(walletAddress);
  if (managerIds.length === 0) {
    throw new AppError(
      404,
      "NO_MARGIN_MANAGER",
      "You don't have a margin manager yet. One needs to be created before you can use margin TPSL.",
    );
  }

  return {
    managerKey: "MARGIN_1",
    marginManagerAddress: managerIds[0],
    poolKey,
  };
}

function buildDeepBookClientWithMargin(
  walletAddress: string,
  managerKey: string,
  marginManagerAddress: string,
  poolKey: string,
  balanceManagerObjectId?: string,
): DeepBookClient {
  const { coins, pools } = getDeepBookEnv();
  const client = getSuiClient().$extend(
    deepbook({
      address: walletAddress,
      balanceManagers: balanceManagerObjectId
        ? { RADIANT_BM_1: { address: balanceManagerObjectId } }
        : undefined,
      marginManagers: {
        [managerKey]: { address: marginManagerAddress, poolKey },
      },
      coins,
      pools,
    }),
  );
  return (client as unknown as { deepbook: DeepBookClient }).deepbook;
}

async function buildAndSignExecute(
  privyUserId: string,
  walletAddress: string,
  build: (tx: Transaction, deepbookClient: DeepBookClient) => void,
  marginManagerAddress: string,
  managerKey: string,
  poolKey: string,
): Promise<TxResult> {
  const agentWallet = await resolveSuiAgentWallet(privyUserId);
  const privyWallet = await getPrivyClient().wallets().get(agentWallet.privy_wallet_id);
  if (!privyWallet.public_key) {
    throw new AppError(502, "WALLET_METADATA_MISSING", "Missing public key on wallet");
  }

  let balanceManagerId: string | undefined;
  try {
    const bm = await ensureBalanceManager(privyUserId);
    balanceManagerId = bm.manager_object_id;
  } catch {
    // Balance manager may not exist yet for margin-only flows
  }

  const dbClient = buildDeepBookClientWithMargin(
    walletAddress,
    managerKey,
    marginManagerAddress,
    poolKey,
    balanceManagerId,
  );

  const tx = new Transaction();
  tx.setSender(walletAddress);
  build(tx, dbClient);

  const transactionBytes = await tx.build({ client: getSuiClient() });
  const serializedSignature = await signSuiTransactionBytes({
    privyWalletId: agentWallet.privy_wallet_id,
    suiAddress: walletAddress,
    publicKeyBase58: privyWallet.public_key,
    transactionBytes,
  });

  const result = await executeSignedSuiTransaction({
    transactionBytes,
    serializedSignature,
    suiAddress: walletAddress,
  });

  return {
    chain_id: "sui",
    digest: result.digest,
    address: result.sui_address,
    effects_status: result.effects_status,
  };
}

export function resolveTpslType(params: Record<string, unknown>): TpslType {
  const raw = String(params.tpsl_type ?? params.order_type ?? params.type ?? "")
    .trim()
    .toLowerCase();
  if (raw === "take_profit" || raw === "tp") {
    return "take_profit";
  }
  if (raw === "stop_loss" || raw === "sl") {
    return "stop_loss";
  }
  if (params.trigger_below_price === true || params.trigger_below_price === "true") {
    return "stop_loss";
  }
  if (params.trigger_below_price === false || params.trigger_below_price === "false") {
    return "take_profit";
  }
  throw new AppError(
    400,
    "VALIDATION_ERROR",
    'tpsl_type is required: "take_profit" (trigger when price rises above trigger_price) or "stop_loss" (trigger when price falls below trigger_price).',
  );
}

export function resolveTriggerBelowPrice(params: Record<string, unknown>): boolean {
  return resolveTpslType(params) === "stop_loss";
}

export function resolveTpslOrderKind(params: Record<string, unknown>): TpslOrderKind {
  const raw = String(params.order_kind ?? params.pending_order_kind ?? "market")
    .trim()
    .toLowerCase();
  if (raw === "limit") {
    return "limit";
  }
  if (raw === "market") {
    return "market";
  }
  throw new AppError(400, "VALIDATION_ERROR", 'order_kind must be "limit" or "market".');
}

export function resolveConditionalOrderId(params: Record<string, unknown>): string {
  const raw = params.conditional_order_id ?? params.conditionalOrderId;
  if (raw != null && String(raw).trim().length > 0) {
    return String(raw).trim();
  }
  return String(Date.now() % 1_000_000_000_000);
}

export function parseMarginTpslAddParams(params: Record<string, unknown>): ParsedMarginTpslAddParams {
  const tpslType = resolveTpslType(params);
  const triggerPrice = parsePositiveAmount(params.trigger_price ?? params.triggerPrice, "trigger_price");
  const quantity = parsePositiveAmount(params.quantity, "quantity");
  const isBid = params.is_bid === true || params.is_bid === "true" || params.side === "buy";
  const payWithDeep = params.pay_with_deep === true || params.pay_with_deep === "true";
  const clientOrderId = String(params.client_order_id ?? "0");
  const orderKind = resolveTpslOrderKind(params);

  const pendingOrder =
    orderKind === "limit"
      ? {
          kind: "limit" as const,
          clientOrderId,
          price: parsePositiveAmount(params.price, "price"),
          quantity,
          isBid,
          payWithDeep,
        }
      : {
          kind: "market" as const,
          clientOrderId,
          quantity,
          isBid,
          payWithDeep,
        };

  return {
    managerKey: "MARGIN_1",
    conditionalOrderId: resolveConditionalOrderId(params),
    triggerBelowPrice: tpslType === "stop_loss",
    triggerPrice,
    pendingOrder,
    tpslType,
  };
}

function toSdkAddParams(
  managerKey: string,
  parsed: ParsedMarginTpslAddParams,
): AddConditionalOrderParams {
  const pendingOrder =
    parsed.pendingOrder.kind === "limit"
      ? {
          clientOrderId: parsed.pendingOrder.clientOrderId,
          price: parsed.pendingOrder.price,
          quantity: parsed.pendingOrder.quantity,
          isBid: parsed.pendingOrder.isBid,
          payWithDeep: parsed.pendingOrder.payWithDeep,
        }
      : {
          clientOrderId: parsed.pendingOrder.clientOrderId,
          quantity: parsed.pendingOrder.quantity,
          isBid: parsed.pendingOrder.isBid,
          payWithDeep: parsed.pendingOrder.payWithDeep,
        };

  return {
    marginManagerKey: managerKey,
    conditionalOrderId: parsed.conditionalOrderId,
    triggerBelowPrice: parsed.triggerBelowPrice,
    triggerPrice: parsed.triggerPrice,
    pendingOrder,
  };
}

export async function executeMarginTpslAdd(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<MarginExecResult> {
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const { managerKey, marginManagerAddress, poolKey } = await resolveMarginManagerKey(
    privyUserId,
    wallet.address,
    params,
  );
  const parsed = parseMarginTpslAddParams(params);
  const sdkParams = toSdkAddParams(managerKey, parsed);

  const result = await buildAndSignExecute(
    privyUserId,
    wallet.address,
    (tx, client) => {
      tx.add(client.marginTPSL.addConditionalOrder(sdkParams));
    },
    marginManagerAddress,
    managerKey,
    poolKey,
  );

  return {
    ...result,
    margin: {
      action: "tpsl_add",
      margin_manager: marginManagerAddress,
      pool_key: poolKey,
      amount: parsed.pendingOrder.quantity,
    },
  };
}

export async function executeMarginTpslCancel(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<MarginExecResult> {
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const { managerKey, marginManagerAddress, poolKey } = await resolveMarginManagerKey(
    privyUserId,
    wallet.address,
    params,
  );
  const conditionalOrderId = String(
    params.conditional_order_id ?? params.conditionalOrderId ?? "",
  ).trim();
  if (!conditionalOrderId) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "conditional_order_id is required to cancel a margin TPSL order.",
    );
  }

  const result = await buildAndSignExecute(
    privyUserId,
    wallet.address,
    (tx, client) => {
      tx.add(client.marginTPSL.cancelConditionalOrder(managerKey, conditionalOrderId));
    },
    marginManagerAddress,
    managerKey,
    poolKey,
  );

  return {
    ...result,
    margin: {
      action: "tpsl_cancel",
      margin_manager: marginManagerAddress,
      pool_key: poolKey,
    },
  };
}

export async function executeMarginTpslCancelAll(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<MarginExecResult> {
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const { managerKey, marginManagerAddress, poolKey } = await resolveMarginManagerKey(
    privyUserId,
    wallet.address,
    params,
  );

  const result = await buildAndSignExecute(
    privyUserId,
    wallet.address,
    (tx, client) => {
      tx.add(client.marginTPSL.cancelAllConditionalOrders(managerKey));
    },
    marginManagerAddress,
    managerKey,
    poolKey,
  );

  return {
    ...result,
    margin: {
      action: "tpsl_cancel_all",
      margin_manager: marginManagerAddress,
      pool_key: poolKey,
    },
  };
}

export async function executeMarginTpslExecute(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<MarginExecResult> {
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const { marginManagerAddress, poolKey } = await resolveMarginManagerKey(
    privyUserId,
    wallet.address,
    params,
  );
  const maxOrders = Number(params.max_orders ?? params.maxOrders ?? 10);
  if (!Number.isFinite(maxOrders) || maxOrders <= 0) {
    throw new AppError(400, "VALIDATION_ERROR", "max_orders must be a positive number.");
  }

  const result = await buildAndSignExecute(
    privyUserId,
    wallet.address,
    (tx, client) => {
      tx.add(
        client.marginTPSL.executeConditionalOrders(
          marginManagerAddress,
          poolKey,
          Math.trunc(maxOrders),
        ),
      );
    },
    marginManagerAddress,
    "MARGIN_1",
    poolKey,
  );

  return {
    ...result,
    margin: {
      action: "tpsl_execute",
      margin_manager: marginManagerAddress,
      pool_key: poolKey,
    },
  };
}

export async function preflightMarginTpslAction(
  action: string,
  params: Record<string, unknown>,
): Promise<void> {
  if (action === "deepbook_margin_tpsl_add") {
    parseMarginTpslAddParams(params);
    return;
  }
  if (action === "deepbook_margin_tpsl_cancel") {
    const id = params.conditional_order_id ?? params.conditionalOrderId;
    if (!id) {
      throw new AppError(400, "VALIDATION_ERROR", "conditional_order_id is required.");
    }
    return;
  }
  if (action === "deepbook_margin_tpsl_execute") {
    const maxOrders = params.max_orders ?? params.maxOrders ?? 10;
    const n = Number(maxOrders);
    if (!Number.isFinite(n) || n <= 0) {
      throw new AppError(400, "VALIDATION_ERROR", "max_orders must be a positive number.");
    }
  }
}
