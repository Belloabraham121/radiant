import { Transaction } from "@mysten/sui/transactions";
import { getDeepBookEnv } from "../../config/deepbook.js";
import { AppError } from "../../errors/app-error.js";
import { getSuiClient } from "../../infrastructure/sui/client.js";
import { getPrivyClient } from "../../infrastructure/privy/client.js";
import { resolveAgentWalletByPrivyUserId } from "../wallet/agent-wallet.service.js";
import { executeSignedSuiTransaction } from "../wallet/sui-transaction.service.js";
import { signSuiTransactionBytes } from "../wallet/sui-signing.service.js";
import {
  checkManagerBalance,
  ensureBalanceManager,
} from "./deepbook-balance-manager.service.js";
import type { ProvisionedDeepBookManager } from "./deepbook-balance-manager.types.js";
import { normalizePoolKey } from "./pool-key.js";
import {
  getDeepBookClient,
  getSuiDeepBookClient,
  type SuiDeepBookExtendedClient,
} from "./providers/sui-deepbook.provider.js";
import type { DeepBookClientContext } from "./types.js";
import type { TxResult } from "../chains/types.js";

export const DEEPBOOK_STAKE_ACTION = "deepbook_stake" as const;
export const DEEPBOOK_UNSTAKE_ACTION = "deepbook_unstake" as const;

const STAKE_ACTIONS = new Set([DEEPBOOK_STAKE_ACTION, DEEPBOOK_UNSTAKE_ACTION]);

export type DeepBookStakeParams = {
  pool_key: string;
  amount_display: number;
};

export type DeepBookUnstakeParams = {
  pool_key: string;
};

export type DeepBookStakeBalanceResult = {
  pool_key: string;
  manager_key: string;
  manager_object_id: string;
  active_stake: number;
  inactive_stake: number;
  total_stake: number;
  created_proposal: boolean;
  voted_proposal: string | null;
  source: "sdk";
};

export type DeepBookStakeRequiredResult = {
  pool_key: string;
  stake_required: number;
  taker_fee: number;
  maker_fee: number;
  next_epoch: {
    stake_required: number;
    taker_fee: number;
    maker_fee: number;
  };
  source: "sdk";
};

export type DeepBookStakeTxResult = TxResult & {
  pool_key: string;
  action: typeof DEEPBOOK_STAKE_ACTION | typeof DEEPBOOK_UNSTAKE_ACTION;
  amount_display?: number;
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

function assertPoolKey(poolKey: string): string {
  const normalized = normalizePoolKey(poolKey);
  const { pools } = getDeepBookEnv();
  if (!pools[normalized as keyof typeof pools]) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `Unknown DeepBook pool "${poolKey}". Call query_chain deepbook_pools for the full list. ` +
        `Known pools include ${Object.keys(pools).join(", ")}.`,
    );
  }
  return normalized;
}

function readPositiveAmount(params: Record<string, unknown>): number {
  for (const key of [
    "amount_display",
    "amount",
    "stake_amount",
    "quantity",
    "value",
  ] as const) {
    const raw = params[key];
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return raw;
    }
    if (typeof raw === "string") {
      const trimmed = raw.trim().replace(/,/g, "");
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  throw new AppError(
    400,
    "VALIDATION_ERROR",
    "Stake requires a positive amount: params.amount_display (preferred), amount, or stake_amount.",
  );
}

function parsePoolKeyParam(params: Record<string, unknown>): string {
  const raw = params.pool_key ?? params.pool ?? getDeepBookEnv().defaultPool;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "params.pool_key is required for staking.");
  }
  return assertPoolKey(raw);
}

export function isDeepBookStakeAction(action: string): boolean {
  return STAKE_ACTIONS.has(action);
}

export function parseDeepBookStakeParams(params: Record<string, unknown>): DeepBookStakeParams {
  return {
    pool_key: parsePoolKeyParam(params),
    amount_display: readPositiveAmount(params),
  };
}

export function parseDeepBookUnstakeParams(params: Record<string, unknown>): DeepBookUnstakeParams {
  return {
    pool_key: parsePoolKeyParam(params),
  };
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

async function buildAndExecuteStakeTransaction(
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

export async function getDeepBookStakeBalance(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<DeepBookStakeBalanceResult> {
  const poolKey = parsePoolKeyParam(params);
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const manager = await ensureBalanceManager(privyUserId);
  const client = getDeepBookClient(toClientContext(wallet.address, manager));
  const account = await client.account(poolKey, manager.manager_key);

  return {
    pool_key: poolKey,
    manager_key: manager.manager_key,
    manager_object_id: manager.manager_object_id,
    active_stake: account.active_stake,
    inactive_stake: account.inactive_stake,
    total_stake: account.active_stake + account.inactive_stake,
    created_proposal: account.created_proposal,
    voted_proposal: account.voted_proposal,
    source: "sdk",
  };
}

export async function getDeepBookStakeRequired(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<DeepBookStakeRequiredResult> {
  const poolKey = parsePoolKeyParam(params);
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const manager = await ensureBalanceManager(privyUserId);
  const client = getDeepBookClient(toClientContext(wallet.address, manager));

  const [current, next] = await Promise.all([
    client.poolTradeParams(poolKey),
    client.poolTradeParamsNext(poolKey),
  ]);

  return {
    pool_key: poolKey,
    stake_required: current.stakeRequired,
    taker_fee: current.takerFee,
    maker_fee: current.makerFee,
    next_epoch: {
      stake_required: next.stakeRequired,
      taker_fee: next.takerFee,
      maker_fee: next.makerFee,
    },
    source: "sdk",
  };
}

export async function executeDeepBookStake(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<DeepBookStakeTxResult> {
  const parsed = parseDeepBookStakeParams(params);
  const managerBalance = await checkManagerBalance(privyUserId, "DEEP");
  if (managerBalance.balance_display < parsed.amount_display) {
    throw new AppError(
      400,
      "INSUFFICIENT_BALANCE",
      `DeepBook balance manager holds ${managerBalance.balance_display} DEEP but stake needs ${parsed.amount_display} DEEP. ` +
        "Deposit DEEP to the balance manager first (deepbook_deposit with coin_key DEEP).",
    );
  }

  const result = await buildAndExecuteStakeTransaction(privyUserId, (tx, client, manager) => {
    tx.add(
      client.deepbook.governance.stake(
        parsed.pool_key,
        manager.manager_key,
        parsed.amount_display,
      ),
    );
  });

  return {
    ...result,
    pool_key: parsed.pool_key,
    action: DEEPBOOK_STAKE_ACTION,
    amount_display: parsed.amount_display,
  };
}

export async function executeDeepBookUnstake(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<DeepBookStakeTxResult> {
  const parsed = parseDeepBookUnstakeParams(params);

  const result = await buildAndExecuteStakeTransaction(privyUserId, (tx, client, manager) => {
    tx.add(client.deepbook.governance.unstake(parsed.pool_key, manager.manager_key));
  });

  return {
    ...result,
    pool_key: parsed.pool_key,
    action: DEEPBOOK_UNSTAKE_ACTION,
  };
}

/** Test hooks */
export function setDeepBookStakeDepsForTests(deps: {
  executeSignedTx?: typeof executeSignedSuiTransaction;
  signTxBytes?: typeof signSuiTransactionBytes;
  fetchPrivyWallet?: typeof fetchPrivyWallet;
}): void {
  if (deps.executeSignedTx) executeSignedTx = deps.executeSignedTx;
  if (deps.signTxBytes) signTxBytes = deps.signTxBytes;
  if (deps.fetchPrivyWallet) fetchPrivyWallet = deps.fetchPrivyWallet;
}

export function resetDeepBookStakeDepsForTests(): void {
  executeSignedTx = executeSignedSuiTransaction;
  signTxBytes = signSuiTransactionBytes;
  fetchPrivyWallet = async (privyWalletId: string) => {
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
}
