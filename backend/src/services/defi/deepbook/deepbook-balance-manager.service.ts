import type { DeepBookBalanceManager } from "@prisma/client";
import type { DeepBookClient } from "@mysten/deepbook-v3";
import { Transaction, type TransactionArgument } from "@mysten/sui/transactions";
import { DEFAULT_BALANCE_MANAGER_KEY, getDeepBookEnv } from "../../../config/deepbook.js";
import { AppError } from "../../../errors/app-error.js";
import {
  formatPoolKeyCoinKeyError,
  isDeepBookCoinKey,
  isDeepBookPoolKey,
} from "./coin-key.js";
import { getSuiClient } from "../../../infrastructure/sui/client.js";
import { findUserByPrivyId } from "../../auth/user.repository.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import {
  executeSignedSuiTransaction,
  findCreatedObjectIdAfterTransaction,
} from "../../wallet/sui-transaction.service.js";
import { signSuiTransactionBytes } from "../../wallet/sui-signing.service.js";
import { getPrivyClient } from "../../../infrastructure/privy/client.js";
import { getAssetDecimals } from "./asset-scalars.js";
import {
  createBalanceManager,
  findBalanceManagerByPrivyUserId,
  findBalanceManagerByUserId,
} from "./deepbook-balance-manager.repository.js";
import type {
  DeepBookManagerBalance,
  DeepBookManagerBalancesResult,
  DeepBookManagerInfo,
  DeepBookDepositWithdrawParams,
  ProvisionedDeepBookManager,
} from "./deepbook-balance-manager.types.js";
import {
  clearDeepBookClientCache,
  getDeepBookClient,
  getSuiDeepBookClient,
  type SuiDeepBookExtendedClient,
} from "./providers/sui-deepbook.provider.js";
import type { DeepBookClientContext } from "./types.js";
import type { TxResult } from "../../chains/types.js";

const BALANCE_MANAGER_TYPE = "balance_manager::BalanceManager";
const ensureInFlight = new Map<string, Promise<ProvisionedDeepBookManager>>();

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

function toManagerInfo(row: DeepBookBalanceManager): ProvisionedDeepBookManager {
  return {
    chain_id: "sui",
    manager_key: row.manager_key,
    manager_object_id: row.manager_object_id,
    trade_cap_id: row.trade_cap_id,
    provisioned: true,
  };
}

function unprovisionedManagerInfo(): DeepBookManagerInfo {
  const { defaultManagerKey } = getDeepBookEnv();
  return {
    chain_id: "sui",
    manager_key: defaultManagerKey,
    manager_object_id: null,
    trade_cap_id: null,
    provisioned: false,
  };
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

function assertCoinKey(coinKey: string): string {
  const normalized = coinKey.trim().toUpperCase();
  if (isDeepBookCoinKey(normalized)) {
    return normalized;
  }
  if (isDeepBookPoolKey(normalized)) {
    throw new AppError(400, "VALIDATION_ERROR", formatPoolKeyCoinKeyError(coinKey));
  }
  const { coins } = getDeepBookEnv();
  throw new AppError(
    400,
    "VALIDATION_ERROR",
    `Unknown DeepBook coin key "${coinKey}". Supported keys include ${Object.keys(coins).join(", ")}.`,
  );
}

const DEPOSIT_AMOUNT_PARAM_KEYS = [
  "amount_display",
  "amount",
  "quantity",
  "deposit_amount",
  "value",
  "size",
] as const;

const COIN_AMOUNT_PARAM_KEYS: Record<string, readonly string[]> = {
  SUI: ["amount_sui", "sui_amount"],
  USDC: ["amount_usdc", "usdc_amount"],
  DEEP: ["amount_deep", "deep_amount"],
  WAL: ["amount_wal", "wal_amount"],
  USDT: ["amount_usdt", "usdt_amount"],
};

function readPositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim().replace(/,/g, "");
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function parseAmountDisplay(
  params: Record<string, unknown>,
  coinKey: string,
): number {
  for (const key of DEPOSIT_AMOUNT_PARAM_KEYS) {
    const amount = readPositiveNumber(params[key]);
    if (amount !== null) {
      return amount;
    }
  }

  for (const key of COIN_AMOUNT_PARAM_KEYS[coinKey] ?? []) {
    const amount = readPositiveNumber(params[key]);
    if (amount !== null) {
      return amount;
    }
  }

  const rawAtomic = params.amount_atomic;
  if (typeof rawAtomic === "string" && /^[1-9]\d*$/.test(rawAtomic)) {
    const decimals = getAssetDecimals(coinKey);
    return Number(rawAtomic) / 10 ** decimals;
  }

  throw new AppError(
    400,
    "VALIDATION_ERROR",
    "Deposit/withdraw requires a positive amount: params.amount_display (preferred), amount, quantity, or amount_atomic.",
  );
}

function inferCoinKeyFromParams(params: Record<string, unknown>): string | null {
  for (const [coin, keys] of Object.entries(COIN_AMOUNT_PARAM_KEYS)) {
    for (const key of keys) {
      if (readPositiveNumber(params[key]) !== null) {
        return coin;
      }
    }
  }
  return null;
}

function resolveCoinKey(params: Record<string, unknown>): string {
  for (const key of ["coin_key", "coin", "token", "asset"] as const) {
    const raw = params[key];
    if (typeof raw === "string" && raw.trim().length > 0) {
      return assertCoinKey(raw);
    }
  }

  const inferred = inferCoinKeyFromParams(params);
  if (inferred) {
    return inferred;
  }

  throw new AppError(
    400,
    "VALIDATION_ERROR",
    'params.coin_key is required (e.g. "SUI", "USDC").',
  );
}

function isWithdrawAllRequest(params: Record<string, unknown>): boolean {
  const flag = params.withdraw_all ?? params.withdrawAll;
  if (flag === true || flag === "true" || flag === 1) {
    return true;
  }
  if (params.all === true || params.all === "true") {
    return true;
  }

  for (const key of DEPOSIT_AMOUNT_PARAM_KEYS) {
    const raw = params[key];
    if (typeof raw === "string" && raw.trim().toLowerCase() === "all") {
      return true;
    }
  }

  return false;
}

export function parseDeepBookDepositWithdrawParams(
  params: Record<string, unknown>,
): DeepBookDepositWithdrawParams {
  const coinKey = resolveCoinKey(params);

  if (isWithdrawAllRequest(params)) {
    return { coin_key: coinKey, amount_display: 0, withdraw_all: true };
  }

  return {
    coin_key: coinKey,
    amount_display: parseAmountDisplay(params, coinKey),
    withdraw_all: false,
    recipient:
      typeof params.recipient === "string" && params.recipient.length > 0
        ? params.recipient
        : undefined,
  };
}

/** Add a balance-manager trade proof to an existing PTB (orders/swaps in later phases). */
export function addBalanceManagerProofToTransaction(
  tx: Transaction,
  deepbook: DeepBookClient,
  managerKey: string,
): TransactionArgument {
  return tx.add(deepbook.balanceManager.generateProof(managerKey));
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

async function buildAndExecuteTransaction(
  privyUserId: string,
  build: (tx: Transaction, client: SuiDeepBookExtendedClient) => void,
  deepbookContext?: DeepBookClientContext,
): Promise<TxResult> {
  const agentWallet = await resolveSuiAgentWallet(privyUserId);
  const privyWallet = await fetchPrivyWallet(agentWallet.privy_wallet_id);

  const tx = new Transaction();
  tx.setSender(agentWallet.address);

  const ctx = deepbookContext ?? { address: agentWallet.address };
  const extended = getSuiDeepBookClient(ctx);
  build(tx, extended);

  const transactionBytes = await tx.build({ client: getSuiClient() });
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

async function discoverOnChainManager(walletAddress: string): Promise<string | null> {
  const client = getDeepBookClient({ address: walletAddress });
  const ids = await client.getBalanceManagerIds(walletAddress);
  return ids[0] ?? null;
}

async function createAndPersistBalanceManager(
  privyUserId: string,
  userId: bigint,
  walletAddress: string,
): Promise<ProvisionedDeepBookManager> {
  const { defaultManagerKey } = getDeepBookEnv();

  const createResult = await buildAndExecuteTransaction(privyUserId, (tx, client) => {
    tx.add(client.deepbook.balanceManager.createAndShareBalanceManager());
  });

  const managerObjectId = await findCreatedObjectIdAfterTransaction(
    createResult.digest,
    BALANCE_MANAGER_TYPE,
  );

  if (!managerObjectId) {
    throw new AppError(
      502,
      "BALANCE_MANAGER_CREATE_FAILED",
      "Balance manager transaction succeeded but the new object id could not be resolved",
      { digest: createResult.digest },
    );
  }

  let row: DeepBookBalanceManager;
  try {
    row = await createBalanceManager({
      user: { connect: { id: userId } },
      chain_id: "sui",
      manager_object_id: managerObjectId,
      manager_key: defaultManagerKey,
    });
  } catch (err) {
    const existing = await findBalanceManagerByUserId(userId);
    if (existing) {
      return toManagerInfo(existing);
    }
    throw err;
  }

  clearDeepBookClientCache();

  const manager: ProvisionedDeepBookManager = {
    ...toManagerInfo(row),
    provision_digest: createResult.digest,
  };
  const ctx = toClientContext(walletAddress, manager);

  try {
    await buildAndExecuteTransaction(
      privyUserId,
      (tx, client) => {
        tx.add(client.deepbook.balanceManager.registerBalanceManager(defaultManagerKey));
      },
      ctx,
    );
  } catch {
    // Registry registration is best-effort; manager is still usable for deposits/withdrawals.
  }

  return manager;
}

export async function executeDeepBookProvisionManager(
  privyUserId: string,
): Promise<
  TxResult & {
    manager_object_id: string;
    already_provisioned: boolean;
  }
> {
  const existing = await findBalanceManagerByPrivyUserId(privyUserId);
  const wallet = await resolveSuiAgentWallet(privyUserId);

  if (existing) {
    return {
      chain_id: "sui",
      digest: "",
      address: wallet.address,
      effects_status: "success",
      manager_object_id: existing.manager_object_id,
      already_provisioned: true,
    };
  }

  const manager = await ensureBalanceManager(privyUserId);
  return {
    chain_id: "sui",
    digest: manager.provision_digest ?? "",
    address: wallet.address,
    effects_status: "success",
    manager_object_id: manager.manager_object_id,
    already_provisioned: false,
  };
}

export async function ensureBalanceManager(privyUserId: string): Promise<ProvisionedDeepBookManager> {
  const inFlight = ensureInFlight.get(privyUserId);
  if (inFlight) return inFlight;

  const promise = ensureBalanceManagerInner(privyUserId).finally(() => {
    ensureInFlight.delete(privyUserId);
  });
  ensureInFlight.set(privyUserId, promise);
  return promise;
}

async function ensureBalanceManagerInner(privyUserId: string): Promise<ProvisionedDeepBookManager> {
  const existing = await findBalanceManagerByPrivyUserId(privyUserId);
  if (existing) {
    return toManagerInfo(existing);
  }

  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found. Call GET /api/v1/auth/me first.");
  }

  const wallet = await resolveSuiAgentWallet(privyUserId);
  const discovered = await discoverOnChainManager(wallet.address);
  if (discovered) {
    const { defaultManagerKey } = getDeepBookEnv();
    try {
      const row = await createBalanceManager({
        user: { connect: { id: user.id } },
        chain_id: "sui",
        manager_object_id: discovered,
        manager_key: defaultManagerKey,
      });
      return toManagerInfo(row);
    } catch {
      const raced = await findBalanceManagerByUserId(user.id);
      if (raced) return toManagerInfo(raced);
      throw new AppError(
        409,
        "BALANCE_MANAGER_CONFLICT",
        "Could not persist discovered balance manager",
      );
    }
  }

  return createAndPersistBalanceManager(privyUserId, user.id, wallet.address);
}

export async function getDeepBookManagerInfo(
  privyUserId: string,
): Promise<DeepBookManagerInfo> {
  const row = await findBalanceManagerByPrivyUserId(privyUserId);
  return row ? toManagerInfo(row) : unprovisionedManagerInfo();
}

async function readManagerBalance(
  privyUserId: string,
  manager: ProvisionedDeepBookManager,
  coinKey: string,
): Promise<DeepBookManagerBalance> {
  const normalizedCoin = assertCoinKey(coinKey);
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const client = getDeepBookClient(toClientContext(wallet.address, manager));
  const result = await client.checkManagerBalance(manager.manager_key, normalizedCoin);

  return {
    coin_key: normalizedCoin,
    coin_type: result.coinType,
    balance_display: result.balance,
  };
}

export async function checkManagerBalance(
  privyUserId: string,
  coinKey: string,
): Promise<DeepBookManagerBalance> {
  const manager = await ensureBalanceManager(privyUserId);
  return readManagerBalance(privyUserId, manager, coinKey);
}

export async function getDeepBookManagerBalances(
  privyUserId: string,
  coinKeys?: string[],
): Promise<DeepBookManagerBalancesResult> {
  const manager = await ensureBalanceManager(privyUserId);
  return getDeepBookManagerBalancesForManager(privyUserId, manager, coinKeys);
}

async function getDeepBookManagerBalancesForManager(
  privyUserId: string,
  manager: ProvisionedDeepBookManager,
  coinKeys?: string[],
): Promise<DeepBookManagerBalancesResult> {
  const keys =
    coinKeys && coinKeys.length > 0
      ? coinKeys.map(assertCoinKey)
      : ["SUI", "USDC", "DEEP", "USDT"];

  const balances = await Promise.all(
    keys.map((coinKey) => readManagerBalance(privyUserId, manager, coinKey)),
  );

  return {
    chain_id: "sui",
    manager_key: manager.manager_key,
    manager_object_id: manager.manager_object_id,
    balances,
  };
}

/** UI read — does not provision a manager; returns empty balances when absent. */
export async function getDeepBookManagerUiData(privyUserId: string): Promise<{
  manager: DeepBookManagerInfo;
  balances: DeepBookManagerBalancesResult | null;
  updated_at: string;
}> {
  const manager = await getDeepBookManagerInfo(privyUserId);
  if (!manager.provisioned || !manager.manager_object_id) {
    return { manager, balances: null, updated_at: new Date().toISOString() };
  }

  const row = await findBalanceManagerByPrivyUserId(privyUserId);
  if (!row) {
    return { manager, balances: null, updated_at: new Date().toISOString() };
  }

  const balances = await getDeepBookManagerBalancesForManager(
    privyUserId,
    toManagerInfo(row),
  );

  return { manager, balances, updated_at: new Date().toISOString() };
}

export async function executeDeepBookDeposit(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<TxResult & { coin_key: string; amount_display: number; manager_object_id: string }> {
  const parsed = parseDeepBookDepositWithdrawParams(params);
  const manager = await ensureBalanceManager(privyUserId);
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const ctx = toClientContext(wallet.address, manager);

  const result = await buildAndExecuteTransaction(
    privyUserId,
    (tx, client) => {
      tx.add(
        client.deepbook.balanceManager.depositIntoManager(
          manager.manager_key,
          parsed.coin_key,
          parsed.amount_display,
        ),
      );
    },
    ctx,
  );

  return {
    ...result,
    coin_key: parsed.coin_key,
    amount_display: parsed.amount_display,
    manager_object_id: manager.manager_object_id,
  };
}

export async function preflightDeepBookWithdraw(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<void> {
  const parsed = parseDeepBookDepositWithdrawParams(params);
  const balance = await checkManagerBalance(privyUserId, parsed.coin_key);
  const requested = parsed.withdraw_all ? balance.balance_display : parsed.amount_display;

  if (requested <= 0) {
    throw new AppError(
      400,
      "INSUFFICIENT_BALANCE",
      `No ${parsed.coin_key} in your DeepBook balance manager to withdraw.`,
    );
  }

  if (balance.balance_display < requested) {
    throw new AppError(
      400,
      "INSUFFICIENT_BALANCE",
      `Your DeepBook balance manager has ${balance.balance_display} ${parsed.coin_key}, which is not enough to withdraw ${parsed.withdraw_all ? "everything" : `${requested} ${parsed.coin_key}`}.`,
    );
  }
}

export async function executeDeepBookWithdraw(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<TxResult & { coin_key: string; amount_display: number; manager_object_id: string }> {
  const parsed = parseDeepBookDepositWithdrawParams(params);
  const manager = await ensureBalanceManager(privyUserId);
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const recipient = parsed.recipient ?? wallet.address;
  const ctx = toClientContext(wallet.address, manager);

  let amountDisplay = parsed.amount_display;
  const managerBalance = await readManagerBalance(privyUserId, manager, parsed.coin_key);

  if (parsed.withdraw_all) {
    amountDisplay = managerBalance.balance_display;
    if (amountDisplay <= 0) {
      throw new AppError(
        400,
        "INSUFFICIENT_BALANCE",
        `No ${parsed.coin_key} in your DeepBook balance manager to withdraw.`,
      );
    }
  } else if (managerBalance.balance_display < amountDisplay) {
    throw new AppError(
      400,
      "INSUFFICIENT_BALANCE",
      `Your DeepBook balance manager has ${managerBalance.balance_display} ${parsed.coin_key}, which is not enough to withdraw ${amountDisplay} ${parsed.coin_key}.`,
    );
  }

  const result = await buildAndExecuteTransaction(
    privyUserId,
    (tx, client) => {
      if (parsed.withdraw_all) {
        tx.add(
          client.deepbook.balanceManager.withdrawAllFromManager(
            manager.manager_key,
            parsed.coin_key,
            recipient,
          ),
        );
      } else {
        tx.add(
          client.deepbook.balanceManager.withdrawFromManager(
            manager.manager_key,
            parsed.coin_key,
            parsed.amount_display,
            recipient,
          ),
        );
      }
    },
    ctx,
  );

  return {
    ...result,
    coin_key: parsed.coin_key,
    amount_display: amountDisplay,
    manager_object_id: manager.manager_object_id,
  };
}

/** Test hooks */
export function resetBalanceManagerServiceForTests(): void {
  ensureInFlight.clear();
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

export function setExecuteSignedTxForTests(
  fn: typeof executeSignedSuiTransaction,
): void {
  executeSignedTx = fn;
}

export function setSignTxBytesForTests(fn: typeof signSuiTransactionBytes): void {
  signTxBytes = fn;
}
