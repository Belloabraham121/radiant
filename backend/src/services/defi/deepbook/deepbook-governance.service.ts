import { Transaction } from "@mysten/sui/transactions";
import { getDeepBookEnv } from "../../../config/deepbook.js";
import { AppError } from "../../../errors/app-error.js";
import { assertGovernanceEnabled } from "../../agent/agent-permissions.service.js";
import { getSuiClient } from "../../../infrastructure/sui/client.js";
import { getPrivyClient } from "../../../infrastructure/privy/client.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import { executeSignedSuiTransaction } from "../../wallet/sui-transaction.service.js";
import { signSuiTransactionBytes } from "../../wallet/sui-signing.service.js";
import { ensureBalanceManager } from "./deepbook-balance-manager.service.js";
import type { ProvisionedDeepBookManager } from "./deepbook-balance-manager.types.js";
import { normalizePoolKey } from "./pool-key.js";
import {
  getDeepBookClient,
  getSuiDeepBookClient,
  type SuiDeepBookExtendedClient,
} from "./providers/sui-deepbook.provider.js";
import type { DeepBookClientContext } from "./types.js";
import type { TxResult } from "../../chains/types.js";

export const DEEPBOOK_SUBMIT_PROPOSAL_ACTION = "deepbook_submit_proposal" as const;
export const DEEPBOOK_VOTE_ACTION = "deepbook_vote" as const;

const GOVERNANCE_ACTIONS = new Set<string>([
  DEEPBOOK_SUBMIT_PROPOSAL_ACTION,
  DEEPBOOK_VOTE_ACTION,
]);

export type DeepBookSubmitProposalParams = {
  pool_key: string;
  taker_fee: number;
  maker_fee: number;
  stake_required: number;
};

export type DeepBookVoteParams = {
  pool_key: string;
  proposal_id: string;
};

export type DeepBookGovernanceStateResult = {
  pool_key: string;
  manager_key: string;
  manager_object_id: string;
  quorum: number;
  current_epoch: {
    taker_fee: number;
    maker_fee: number;
    stake_required: number;
  };
  next_epoch: {
    taker_fee: number;
    maker_fee: number;
    stake_required: number;
  };
  account: {
    active_stake: number;
    inactive_stake: number;
    created_proposal: boolean;
    voted_proposal: string | null;
  };
  source: "sdk";
};

export type DeepBookGovernanceTxResult = TxResult & {
  pool_key: string;
  action: typeof DEEPBOOK_SUBMIT_PROPOSAL_ACTION | typeof DEEPBOOK_VOTE_ACTION;
  proposal_id?: string;
  taker_fee?: number;
  maker_fee?: number;
  stake_required?: number;
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

function readPositiveNumber(params: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const raw = params[key];
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
      return raw;
    }
    if (typeof raw === "string") {
      const trimmed = raw.trim().replace(/,/g, "");
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed;
      }
    }
  }

  throw new AppError(
    400,
    "VALIDATION_ERROR",
    `Missing or invalid numeric param — expected one of: ${keys.join(", ")}`,
  );
}

function parsePoolKeyParam(params: Record<string, unknown>): string {
  const raw = params.pool_key ?? params.pool ?? getDeepBookEnv().defaultPool;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "params.pool_key is required for governance.");
  }
  return assertPoolKey(raw);
}

function parseProposalId(params: Record<string, unknown>): string {
  for (const key of ["proposal_id", "proposalId", "proposal"] as const) {
    const raw = params[key];
    if (typeof raw === "string" && /^0x[a-fA-F0-9]{64}$/.test(raw.trim())) {
      return raw.trim();
    }
  }

  throw new AppError(
    400,
    "VALIDATION_ERROR",
    "params.proposal_id must be a valid Sui object ID (0x + 64 hex chars). " +
      "Use query_chain deepbook_governance_state to see voted_proposal or ask the user for the proposal ID.",
  );
}

export function isDeepBookGovernanceAction(action: string): boolean {
  return GOVERNANCE_ACTIONS.has(action);
}

export function parseDeepBookSubmitProposalParams(
  params: Record<string, unknown>,
): DeepBookSubmitProposalParams {
  return {
    pool_key: parsePoolKeyParam(params),
    taker_fee: readPositiveNumber(params, "taker_fee", "takerFee"),
    maker_fee: readPositiveNumber(params, "maker_fee", "makerFee"),
    stake_required: readPositiveNumber(params, "stake_required", "stakeRequired", "stake_required_deep"),
  };
}

export function parseDeepBookVoteParams(params: Record<string, unknown>): DeepBookVoteParams {
  return {
    pool_key: parsePoolKeyParam(params),
    proposal_id: parseProposalId(params),
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
  if (/insufficient\s*stake|insufficient\s*balance|not enough/i.test(message)) {
    throw new AppError(400, "INSUFFICIENT_BALANCE", message);
  }
  if (err instanceof AppError) {
    throw err;
  }
  throw err;
}

async function buildAndExecuteGovernanceTransaction(
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

export async function getDeepBookGovernanceState(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<DeepBookGovernanceStateResult> {
  const poolKey = parsePoolKeyParam(params);
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const manager = await ensureBalanceManager(privyUserId);
  const client = getDeepBookClient(toClientContext(wallet.address, manager));

  const [quorum, current, next, account] = await Promise.all([
    client.quorum(poolKey),
    client.poolTradeParams(poolKey),
    client.poolTradeParamsNext(poolKey),
    client.account(poolKey, manager.manager_key),
  ]);

  return {
    pool_key: poolKey,
    manager_key: manager.manager_key,
    manager_object_id: manager.manager_object_id,
    quorum,
    current_epoch: {
      taker_fee: current.takerFee,
      maker_fee: current.makerFee,
      stake_required: current.stakeRequired,
    },
    next_epoch: {
      taker_fee: next.takerFee,
      maker_fee: next.makerFee,
      stake_required: next.stakeRequired,
    },
    account: {
      active_stake: account.active_stake,
      inactive_stake: account.inactive_stake,
      created_proposal: account.created_proposal,
      voted_proposal: account.voted_proposal,
    },
    source: "sdk",
  };
}

export async function executeDeepBookSubmitProposal(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<DeepBookGovernanceTxResult> {
  await assertGovernanceEnabled(privyUserId);
  const parsed = parseDeepBookSubmitProposalParams(params);

  const result = await buildAndExecuteGovernanceTransaction(privyUserId, (tx, client, manager) => {
    tx.add(
      client.deepbook.governance.submitProposal({
        poolKey: parsed.pool_key,
        balanceManagerKey: manager.manager_key,
        takerFee: parsed.taker_fee,
        makerFee: parsed.maker_fee,
        stakeRequired: parsed.stake_required,
      }),
    );
  });

  return {
    ...result,
    pool_key: parsed.pool_key,
    action: DEEPBOOK_SUBMIT_PROPOSAL_ACTION,
    taker_fee: parsed.taker_fee,
    maker_fee: parsed.maker_fee,
    stake_required: parsed.stake_required,
  };
}

export async function executeDeepBookVote(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<DeepBookGovernanceTxResult> {
  await assertGovernanceEnabled(privyUserId);
  const parsed = parseDeepBookVoteParams(params);

  const result = await buildAndExecuteGovernanceTransaction(privyUserId, (tx, client, manager) => {
    tx.add(
      client.deepbook.governance.vote(
        parsed.pool_key,
        manager.manager_key,
        parsed.proposal_id,
      ),
    );
  });

  return {
    ...result,
    pool_key: parsed.pool_key,
    action: DEEPBOOK_VOTE_ACTION,
    proposal_id: parsed.proposal_id,
  };
}

/** Test hooks */
export function setDeepBookGovernanceDepsForTests(deps: {
  executeSignedTx?: typeof executeSignedSuiTransaction;
  signTxBytes?: typeof signSuiTransactionBytes;
  fetchPrivyWallet?: typeof fetchPrivyWallet;
}): void {
  if (deps.executeSignedTx) executeSignedTx = deps.executeSignedTx;
  if (deps.signTxBytes) signTxBytes = deps.signTxBytes;
  if (deps.fetchPrivyWallet) fetchPrivyWallet = deps.fetchPrivyWallet;
}

export function resetDeepBookGovernanceDepsForTests(): void {
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
