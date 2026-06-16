import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { deepbook, type DeepBookClient } from "@mysten/deepbook-v3";
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
import {
  DEFAULT_MARGIN_MANAGER_SDK_KEY,
  resolvePoolKeyForMarginManagerAddress,
} from "./deepbook-margin-read.service.js";
import type { MarginExecResult } from "./deepbook-margin-execution.service.js";

type CoinSide = "base" | "quote" | "deep";

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
  const poolKey = String(
    params.pool_key ?? params.poolKey ?? getDeepBookEnv().defaultPool,
  ).toUpperCase();

  const rawKey =
    params.margin_manager_address ??
    params.marginManagerAddress ??
    params.margin_manager_key ??
    params.marginManagerKey ??
    params.manager_key;

  if (typeof rawKey === "string" && rawKey.startsWith("0x")) {
    const resolvedPool =
      params.pool_key ?? params.poolKey
        ? poolKey
        : await resolvePoolKeyForMarginManagerAddress(rawKey);
    return { managerKey: "MARGIN_1", marginManagerAddress: rawKey, poolKey: resolvedPool };
  }

  const managerIds = await fetchMarginManagerIdsForOwner(walletAddress);
  if (managerIds.length === 0) {
    throw new AppError(
      404,
      "NO_MARGIN_MANAGER",
      "You don't have a margin manager yet.",
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
    // optional
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

function parsePositiveAmount(raw: unknown, field = "amount"): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new AppError(400, "VALIDATION_ERROR", `${field} must be a positive number (got "${raw}")`);
  }
  return n;
}

function parseObjectId(raw: unknown, field: string): string {
  if (typeof raw === "string" && /^0x[a-fA-F0-9]{64}$/.test(raw.trim())) {
    return raw.trim();
  }
  throw new AppError(
    400,
    "VALIDATION_ERROR",
    `${field} must be a valid Sui object ID (0x + 64 hex chars).`,
  );
}

function resolveSdkCoinKey(poolKey: string, coinSide: CoinSide): string {
  const pool = getDeepBookEnv().pools[poolKey as keyof ReturnType<typeof getDeepBookEnv>["pools"]];
  if (!pool) {
    throw new AppError(400, "VALIDATION_ERROR", `Unknown pool key "${poolKey}".`);
  }
  if (coinSide === "base") return pool.baseCoin;
  if (coinSide === "quote") return pool.quoteCoin;
  return "DEEP";
}

function coinWithDisplayAmount(sdkCoinKey: string, amount: number) {
  const coinMeta = getDeepBookEnv().coins[sdkCoinKey as keyof ReturnType<typeof getDeepBookEnv>["coins"]];
  if (!coinMeta) {
    throw new AppError(400, "VALIDATION_ERROR", `Unknown coin key "${sdkCoinKey}".`);
  }
  return coinWithBalance({
    type: coinMeta.type,
    balance: BigInt(Math.round(amount * coinMeta.scalar)),
  });
}

function resolveDebtIsBase(params: Record<string, unknown>): boolean | undefined {
  if (params.debt_is_base === true || params.debt_is_base === "true") return true;
  if (params.debt_is_base === false || params.debt_is_base === "false") return false;
  const asset = String(params.asset ?? params.debt_asset ?? "").toLowerCase();
  if (asset === "base" || asset === "sui") return true;
  if (asset === "quote" || asset === "usdc" || asset === "dbusdc") return false;
  return undefined;
}

export async function preflightMarginManagerExtrasAction(
  privyUserId: string,
  action: string,
  params: Record<string, unknown>,
): Promise<void> {
  const wallet = await resolveSuiAgentWallet(privyUserId);

  if (action === "deepbook_margin_liquidate") {
    const targetAddress = parseObjectId(
      params.margin_manager_address ?? params.marginManagerAddress ?? params.target_margin_manager,
      "margin_manager_address",
    );
    parsePositiveAmount(params.repay_amount ?? params.amount ?? params.amount_display, "repay_amount");
    const poolKeyParam = params.pool_key ?? params.poolKey;
    const poolKey =
      typeof poolKeyParam === "string" && poolKeyParam.length > 0
        ? String(poolKeyParam).toUpperCase()
        : await resolvePoolKeyForMarginManagerAddress(targetAddress);
    const debtIsBase = resolveDebtIsBase(params);
    if (debtIsBase == null) {
      const readClient = buildDeepBookClientWithMargin(
        wallet.address,
        DEFAULT_MARGIN_MANAGER_SDK_KEY,
        targetAddress,
        poolKey,
      );
      await readClient.getMarginManagerHasBaseDebt(DEFAULT_MARGIN_MANAGER_SDK_KEY);
    }
    return;
  }

  if (action === "deepbook_margin_set_referral") {
    parseObjectId(params.referral_id ?? params.referral ?? params.referralId, "referral_id");
    const managerIds = await fetchMarginManagerIdsForOwner(wallet.address);
    if (managerIds.length === 0) {
      throw new AppError(400, "NO_MARGIN_MANAGER", "No margin manager found for referral setup.");
    }
    return;
  }

  if (action === "deepbook_margin_unset_referral") {
    const managerIds = await fetchMarginManagerIdsForOwner(wallet.address);
    if (managerIds.length === 0) {
      throw new AppError(400, "NO_MARGIN_MANAGER", "No margin manager found for referral unset.");
    }
  }
}

export async function executeMarginLiquidate(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<MarginExecResult> {
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const targetAddress = parseObjectId(
    params.margin_manager_address ?? params.marginManagerAddress ?? params.target_margin_manager,
    "margin_manager_address",
  );
  const repayAmount = parsePositiveAmount(
    params.repay_amount ?? params.amount ?? params.amount_display,
    "repay_amount",
  );

  let poolKey = String(params.pool_key ?? params.poolKey ?? "").trim().toUpperCase();
  if (!poolKey) {
    poolKey = await resolvePoolKeyForMarginManagerAddress(targetAddress);
  }

  let debtIsBase = resolveDebtIsBase(params);
  if (debtIsBase == null) {
    const probeClient = buildDeepBookClientWithMargin(
      wallet.address,
      DEFAULT_MARGIN_MANAGER_SDK_KEY,
      targetAddress,
      poolKey,
    );
    debtIsBase = await probeClient.getMarginManagerHasBaseDebt(DEFAULT_MARGIN_MANAGER_SDK_KEY);
  }

  const repayCoinKey = resolveSdkCoinKey(poolKey, debtIsBase ? "base" : "quote");

  const result = await buildAndSignExecute(
    privyUserId,
    wallet.address,
    (tx, client) => {
      const repayCoin = coinWithDisplayAmount(repayCoinKey, repayAmount);
      tx.add(client.marginManager.liquidate(targetAddress, poolKey, debtIsBase, repayCoin));
    },
    targetAddress,
    DEFAULT_MARGIN_MANAGER_SDK_KEY,
    poolKey,
  );

  return {
    ...result,
    margin: {
      action: "liquidate",
      margin_manager: targetAddress,
      pool_key: poolKey,
      asset: debtIsBase ? "base" : "quote",
      amount: repayAmount,
    },
  };
}

export async function executeMarginSetReferral(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<MarginExecResult> {
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const { managerKey, marginManagerAddress, poolKey } = await resolveMarginManagerKey(
    privyUserId,
    wallet.address,
    params,
  );
  const referralId = parseObjectId(
    params.referral_id ?? params.referral ?? params.referralId,
    "referral_id",
  );

  const result = await buildAndSignExecute(
    privyUserId,
    wallet.address,
    (tx, client) => {
      tx.add(client.marginManager.setMarginManagerReferral(managerKey, referralId));
    },
    marginManagerAddress,
    managerKey,
    poolKey,
  );

  return {
    ...result,
    margin: {
      action: "set_referral",
      margin_manager: marginManagerAddress,
      pool_key: poolKey,
    },
  };
}

export async function executeMarginUnsetReferral(
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
      tx.add(client.marginManager.unsetMarginManagerReferral(managerKey, poolKey));
    },
    marginManagerAddress,
    managerKey,
    poolKey,
  );

  return {
    ...result,
    margin: {
      action: "unset_referral",
      margin_manager: marginManagerAddress,
      pool_key: poolKey,
    },
  };
}

export function resolveSdkCoinKeyForPool(poolKey: string, coinSide: CoinSide): string {
  return resolveSdkCoinKey(poolKey, coinSide);
}

export async function fetchTargetManagerDebtSide(
  walletAddress: string,
  targetAddress: string,
  poolKey: string,
): Promise<boolean> {
  const client = buildDeepBookClientWithMargin(
    walletAddress,
    DEFAULT_MARGIN_MANAGER_SDK_KEY,
    targetAddress,
    poolKey,
  );
  return client.getMarginManagerHasBaseDebt(DEFAULT_MARGIN_MANAGER_SDK_KEY);
}
