import { Transaction } from "@mysten/sui/transactions";
import { deepbook, type DeepBookClient } from "@mysten/deepbook-v3";
import type { TxResult } from "../../chains/types.js";
import { AppError } from "../../../errors/app-error.js";
import { getDeepBookEnv } from "../../../config/deepbook.js";
import { getSuiClient } from "../../../infrastructure/sui/client.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import { executeSignedSuiTransaction } from "../../wallet/sui-transaction.service.js";
import { signSuiTransactionBytes } from "../../wallet/sui-signing.service.js";
import { getPrivyClient } from "../../../infrastructure/privy/client.js";
import {
  ensureBalanceManager,
} from "./deepbook-balance-manager.service.js";
import { getDeepBookClient } from "./providers/sui-deepbook.provider.js";

type CoinSide = "base" | "quote" | "deep";

function normalizeCoinSide(raw: unknown): CoinSide {
  const s = String(raw ?? "").toLowerCase().trim();
  if (s === "base" || s === "sui") return "base";
  if (s === "quote" || s === "usdc" || s === "dbusdc") return "quote";
  if (s === "deep") return "deep";
  throw new AppError(
    400,
    "VALIDATION_ERROR",
    `coin_type must be "base", "quote", or "deep" (got "${raw}")`,
  );
}

function normalizeAssetSide(raw: unknown): "base" | "quote" {
  const s = String(raw ?? "").toLowerCase().trim();
  if (s === "base" || s === "sui") return "base";
  if (s === "quote" || s === "usdc" || s === "dbusdc") return "quote";
  throw new AppError(
    400,
    "VALIDATION_ERROR",
    `asset must be "base" or "quote" (got "${raw}")`,
  );
}

function parsePositiveAmount(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new AppError(400, "VALIDATION_ERROR", `amount must be a positive number (got "${raw}")`);
  }
  return n;
}

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

async function resolveMarginManagerKey(
  privyUserId: string,
  walletAddress: string,
  params: Record<string, unknown>,
): Promise<{ managerKey: string; marginManagerAddress: string; poolKey: string }> {
  const rawKey = params.margin_manager_key ?? params.marginManagerKey ?? params.manager_key;

  const poolKey = String(
    params.pool_key ?? params.poolKey ?? getDeepBookEnv().defaultPool,
  ).toUpperCase();

  if (typeof rawKey === "string" && rawKey.startsWith("0x")) {
    return { managerKey: "MARGIN_1", marginManagerAddress: rawKey, poolKey };
  }

  const client = getDeepBookClient({ address: walletAddress });
  const managerIds = await client.getMarginManagerIdsForOwner(walletAddress);

  if (managerIds.length === 0) {
    throw new AppError(
      404,
      "NO_MARGIN_MANAGER",
      "You don't have a margin manager yet. One needs to be created before you can use margin trading.",
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

export type MarginExecResult = TxResult & {
  margin: {
    action: string;
    margin_manager: string;
    pool_key: string;
    coin_type?: string;
    amount?: number;
    asset?: string;
  };
};

export type MarginProvisionResult = TxResult & {
  margin_manager_address: string;
  pool_key: string;
  already_provisioned: boolean;
};

export async function executeProvisionMarginManager(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<MarginProvisionResult> {
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const poolKey = String(
    params.pool_key ?? params.poolKey ?? getDeepBookEnv().defaultPool,
  ).toUpperCase();

  const client = getDeepBookClient({ address: wallet.address });
  const existingIds = await client.getMarginManagerIdsForOwner(wallet.address);
  if (existingIds.length > 0) {
    return {
      chain_id: "sui",
      digest: "",
      address: wallet.address,
      effects_status: "success",
      margin_manager_address: existingIds[0],
      pool_key: poolKey,
      already_provisioned: true,
    };
  }

  const privyWallet = await getPrivyClient().wallets().get(wallet.privy_wallet_id);
  if (!privyWallet.public_key) {
    throw new AppError(502, "WALLET_METADATA_MISSING", "Missing public key on wallet");
  }

  const tx = new Transaction();
  tx.setSender(wallet.address);
  tx.add(client.marginManager.newMarginManager(poolKey));

  const transactionBytes = await tx.build({ client: getSuiClient() });
  const serializedSignature = await signSuiTransactionBytes({
    privyWalletId: wallet.privy_wallet_id,
    suiAddress: wallet.address,
    publicKeyBase58: privyWallet.public_key,
    transactionBytes,
  });

  const result = await executeSignedSuiTransaction({
    transactionBytes,
    serializedSignature,
    suiAddress: wallet.address,
  });

  const newIds = await client.getMarginManagerIdsForOwner(wallet.address);
  const newManagerAddress = newIds.find((id) => !existingIds.includes(id)) ?? newIds[0] ?? "";

  return {
    chain_id: "sui",
    digest: result.digest,
    address: wallet.address,
    effects_status: result.effects_status,
    margin_manager_address: newManagerAddress,
    pool_key: poolKey,
    already_provisioned: false,
  };
}

export async function executeMarginDeposit(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<MarginExecResult> {
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const { managerKey, marginManagerAddress, poolKey } = await resolveMarginManagerKey(
    privyUserId,
    wallet.address,
    params,
  );
  const coinSide = normalizeCoinSide(params.coin_type ?? params.asset ?? "quote");
  const amount = parsePositiveAmount(params.amount ?? params.amount_display);

  const result = await buildAndSignExecute(
    privyUserId,
    wallet.address,
    (tx, client) => {
      const depositParams = { managerKey, amount };
      if (coinSide === "base") {
        tx.add(client.marginManager.depositBase(depositParams));
      } else if (coinSide === "quote") {
        tx.add(client.marginManager.depositQuote(depositParams));
      } else {
        tx.add(client.marginManager.depositDeep(depositParams));
      }
    },
    marginManagerAddress,
    managerKey,
    poolKey,
  );

  return {
    ...result,
    margin: {
      action: "deposit",
      margin_manager: marginManagerAddress,
      pool_key: poolKey,
      coin_type: coinSide,
      amount,
    },
  };
}

export async function executeMarginWithdraw(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<MarginExecResult> {
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const { managerKey, marginManagerAddress, poolKey } = await resolveMarginManagerKey(
    privyUserId,
    wallet.address,
    params,
  );
  const coinSide = normalizeCoinSide(params.coin_type ?? params.asset ?? "quote");
  const amount = parsePositiveAmount(params.amount ?? params.amount_display);

  const result = await buildAndSignExecute(
    privyUserId,
    wallet.address,
    (tx, client) => {
      if (coinSide === "base") {
        tx.add(client.marginManager.withdrawBase(managerKey, amount));
      } else if (coinSide === "quote") {
        tx.add(client.marginManager.withdrawQuote(managerKey, amount));
      } else {
        tx.add(client.marginManager.withdrawDeep(managerKey, amount));
      }
    },
    marginManagerAddress,
    managerKey,
    poolKey,
  );

  return {
    ...result,
    margin: {
      action: "withdraw",
      margin_manager: marginManagerAddress,
      pool_key: poolKey,
      coin_type: coinSide,
      amount,
    },
  };
}

export async function executeMarginBorrow(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<MarginExecResult> {
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const { managerKey, marginManagerAddress, poolKey } = await resolveMarginManagerKey(
    privyUserId,
    wallet.address,
    params,
  );
  const asset = normalizeAssetSide(params.asset ?? params.coin_type ?? "quote");
  const amount = parsePositiveAmount(params.amount ?? params.amount_display);

  const result = await buildAndSignExecute(
    privyUserId,
    wallet.address,
    (tx, client) => {
      if (asset === "base") {
        tx.add(client.marginManager.borrowBase(managerKey, amount));
      } else {
        tx.add(client.marginManager.borrowQuote(managerKey, amount));
      }
    },
    marginManagerAddress,
    managerKey,
    poolKey,
  );

  return {
    ...result,
    margin: {
      action: "borrow",
      margin_manager: marginManagerAddress,
      pool_key: poolKey,
      asset,
      amount,
    },
  };
}

export async function executeMarginRepay(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<MarginExecResult> {
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const { managerKey, marginManagerAddress, poolKey } = await resolveMarginManagerKey(
    privyUserId,
    wallet.address,
    params,
  );
  const asset = normalizeAssetSide(params.asset ?? params.coin_type ?? "quote");
  const rawAmount = params.amount ?? params.amount_display;
  const amount = rawAmount ? parsePositiveAmount(rawAmount) : undefined;

  const result = await buildAndSignExecute(
    privyUserId,
    wallet.address,
    (tx, client) => {
      if (asset === "base") {
        tx.add(client.marginManager.repayBase(managerKey, amount));
      } else {
        tx.add(client.marginManager.repayQuote(managerKey, amount));
      }
    },
    marginManagerAddress,
    managerKey,
    poolKey,
  );

  return {
    ...result,
    margin: {
      action: "repay",
      margin_manager: marginManagerAddress,
      pool_key: poolKey,
      asset,
      amount,
    },
  };
}

export async function executeMarginPlaceLimitOrder(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<MarginExecResult> {
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const { managerKey, marginManagerAddress, poolKey } = await resolveMarginManagerKey(
    privyUserId,
    wallet.address,
    params,
  );
  const price = parsePositiveAmount(params.price);
  const quantity = parsePositiveAmount(params.quantity);
  const isBid = params.is_bid === true || params.is_bid === "true" || params.side === "buy";
  const payWithDeep = params.pay_with_deep === true || params.pay_with_deep === "true";
  const clientOrderId = String(params.client_order_id ?? "0");

  const result = await buildAndSignExecute(
    privyUserId,
    wallet.address,
    (tx, client) => {
      tx.add(
        client.poolProxy.placeLimitOrder({
          poolKey,
          marginManagerKey: managerKey,
          clientOrderId,
          price,
          quantity,
          isBid,
          payWithDeep,
        }),
      );
    },
    marginManagerAddress,
    managerKey,
    poolKey,
  );

  return {
    ...result,
    margin: {
      action: "place_limit_order",
      margin_manager: marginManagerAddress,
      pool_key: poolKey,
      amount: quantity,
    },
  };
}

export async function executeMarginPlaceMarketOrder(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<MarginExecResult> {
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const { managerKey, marginManagerAddress, poolKey } = await resolveMarginManagerKey(
    privyUserId,
    wallet.address,
    params,
  );
  const quantity = parsePositiveAmount(params.quantity);
  const isBid = params.is_bid === true || params.is_bid === "true" || params.side === "buy";
  const payWithDeep = params.pay_with_deep === true || params.pay_with_deep === "true";
  const clientOrderId = String(params.client_order_id ?? "0");

  const result = await buildAndSignExecute(
    privyUserId,
    wallet.address,
    (tx, client) => {
      tx.add(
        client.poolProxy.placeMarketOrder({
          poolKey,
          marginManagerKey: managerKey,
          clientOrderId,
          quantity,
          isBid,
          payWithDeep,
        }),
      );
    },
    marginManagerAddress,
    managerKey,
    poolKey,
  );

  return {
    ...result,
    margin: {
      action: "place_market_order",
      margin_manager: marginManagerAddress,
      pool_key: poolKey,
      amount: quantity,
    },
  };
}

export async function executeMarginCancelOrder(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<MarginExecResult> {
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const { managerKey, marginManagerAddress, poolKey } = await resolveMarginManagerKey(
    privyUserId,
    wallet.address,
    params,
  );
  const orderId = String(params.order_id ?? params.orderId ?? "");
  if (!orderId) {
    throw new AppError(400, "VALIDATION_ERROR", "order_id is required to cancel a margin order");
  }

  const result = await buildAndSignExecute(
    privyUserId,
    wallet.address,
    (tx, client) => {
      tx.add(client.poolProxy.cancelOrder(managerKey, orderId));
    },
    marginManagerAddress,
    managerKey,
    poolKey,
  );

  return {
    ...result,
    margin: {
      action: "cancel_order",
      margin_manager: marginManagerAddress,
      pool_key: poolKey,
    },
  };
}

export async function executeMarginModifyOrder(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<MarginExecResult> {
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const { managerKey, marginManagerAddress, poolKey } = await resolveMarginManagerKey(
    privyUserId,
    wallet.address,
    params,
  );
  const orderId = String(params.order_id ?? params.orderId ?? "");
  const newQuantity = parsePositiveAmount(params.new_quantity ?? params.quantity);

  if (!orderId) {
    throw new AppError(400, "VALIDATION_ERROR", "order_id is required to modify a margin order");
  }

  const result = await buildAndSignExecute(
    privyUserId,
    wallet.address,
    (tx, client) => {
      tx.add(client.poolProxy.modifyOrder(managerKey, orderId, newQuantity));
    },
    marginManagerAddress,
    managerKey,
    poolKey,
  );

  return {
    ...result,
    margin: {
      action: "modify_order",
      margin_manager: marginManagerAddress,
      pool_key: poolKey,
      amount: newQuantity,
    },
  };
}

/**
 * Preflight check for margin actions — validates prerequisites before showing
 * the approval card. Throws AppError if the user can't proceed (e.g. no margin
 * manager). The error propagates to the agent as a tool error so it can compose
 * a natural response rather than showing a canned UI error.
 */
export async function preflightMarginAction(
  privyUserId: string,
  action: string,
  params: Record<string, unknown>,
): Promise<void> {
  if (action === "deepbook_margin_supply_pool" || action === "deepbook_margin_withdraw_pool") {
    throw new AppError(
      501,
      "MARGIN_SUPPLY_NOT_LIVE",
      "Margin pool supply/withdrawal requires a SupplierCap NFT and is not yet automated.",
    );
  }

  const wallet = await resolveSuiAgentWallet(privyUserId);
  const client = getDeepBookClient({ address: wallet.address });
  const managerIds = await client.getMarginManagerIdsForOwner(wallet.address);

  if (managerIds.length === 0) {
    throw new AppError(
      400,
      "NO_MARGIN_MANAGER",
      "You don't have a margin manager yet. One needs to be created before you can use margin trading.",
    );
  }

  const amount = params.amount ?? params.amount_display ?? params.quantity;
  if (
    action !== "deepbook_margin_cancel_order" &&
    action !== "deepbook_margin_modify_order" &&
    amount != null
  ) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      throw new AppError(400, "VALIDATION_ERROR", `amount must be a positive number (got "${amount}")`);
    }
  }
}

export async function executeMarginAction(
  action: string,
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<MarginExecResult> {
  switch (action) {
    case "deepbook_margin_deposit":
      return executeMarginDeposit(privyUserId, params);
    case "deepbook_margin_withdraw":
      return executeMarginWithdraw(privyUserId, params);
    case "deepbook_margin_borrow":
      return executeMarginBorrow(privyUserId, params);
    case "deepbook_margin_repay":
      return executeMarginRepay(privyUserId, params);
    case "deepbook_margin_place_limit_order":
      return executeMarginPlaceLimitOrder(privyUserId, params);
    case "deepbook_margin_place_market_order":
      return executeMarginPlaceMarketOrder(privyUserId, params);
    case "deepbook_margin_cancel_order":
      return executeMarginCancelOrder(privyUserId, params);
    case "deepbook_margin_modify_order":
      return executeMarginModifyOrder(privyUserId, params);
    case "deepbook_margin_supply_pool":
      throw new AppError(
        501,
        "MARGIN_SUPPLY_NOT_LIVE",
        "Margin pool supply requires a SupplierCap NFT. This action is not yet automated — " +
        "use the DeepBook margin UI directly for pool supply operations.",
      );
    case "deepbook_margin_withdraw_pool":
      throw new AppError(
        501,
        "MARGIN_SUPPLY_NOT_LIVE",
        "Margin pool withdrawal requires a SupplierCap NFT. This action is not yet automated — " +
        "use the DeepBook margin UI directly for pool withdrawal operations.",
      );
    default:
      throw new AppError(400, "UNKNOWN_MARGIN_ACTION", `Unknown margin action: ${action}`);
  }
}
