import { Transaction } from "@mysten/sui/transactions";
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
import { assertGovernanceEnabled } from "../../agent/agent-permissions.service.js";
import { fetchMarginManagerLiveState } from "./deepbook-margin-read.service.js";
import type { MarginExecResult } from "./deepbook-margin-execution.service.js";

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

  const rawKey = params.margin_manager_key ?? params.marginManagerKey ?? params.manager_key;
  if (typeof rawKey === "string" && rawKey.startsWith("0x")) {
    return { managerKey: "MARGIN_1", marginManagerAddress: rawKey, poolKey };
  }

  const managerIds = await fetchMarginManagerIdsForOwner(walletAddress);
  if (managerIds.length === 0) {
    throw new AppError(
      404,
      "NO_MARGIN_MANAGER",
      "You don't have a margin manager yet. One needs to be created before you can use margin stake or governance.",
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

function readPositiveAmount(params: Record<string, unknown>): number {
  for (const key of ["amount_display", "amount", "stake_amount", "quantity"] as const) {
    const raw = params[key];
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return raw;
    }
    if (typeof raw === "string") {
      const parsed = Number(raw.trim().replace(/,/g, ""));
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }
  throw new AppError(
    400,
    "VALIDATION_ERROR",
    "Stake requires a positive amount: params.amount_display, amount, or stake_amount.",
  );
}

function readNonNegativeNumber(params: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const raw = params[key];
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
      return raw;
    }
    if (typeof raw === "string") {
      const parsed = Number(raw.trim().replace(/,/g, ""));
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
    "params.proposal_id must be a valid Sui object ID (0x + 64 hex chars).",
  );
}

export async function preflightMarginStakeGovernanceAction(
  privyUserId: string,
  action: string,
  params: Record<string, unknown>,
): Promise<void> {
  if (action === "deepbook_margin_submit_proposal" || action === "deepbook_margin_vote") {
    await assertGovernanceEnabled(privyUserId);
  }

  const wallet = await resolveSuiAgentWallet(privyUserId);
  const managerIds = await fetchMarginManagerIdsForOwner(wallet.address);
  if (managerIds.length === 0) {
    throw new AppError(
      400,
      "NO_MARGIN_MANAGER",
      "You don't have a margin manager yet. One needs to be created before you can use margin trading.",
    );
  }

  if (action === "deepbook_margin_stake") {
    const amount = readPositiveAmount(params);
    const { marginManagerAddress, poolKey } = await resolveMarginManagerKey(
      privyUserId,
      wallet.address,
      params,
    );
    const live = await fetchMarginManagerLiveState(
      wallet.address,
      marginManagerAddress,
      poolKey,
    );
    const deepBalance = Number(live.deep_balance);
    if (!Number.isFinite(deepBalance) || deepBalance < amount) {
      throw new AppError(
        400,
        "INSUFFICIENT_BALANCE",
        `Margin manager holds ${live.deep_balance} DEEP but stake needs ${amount} DEEP. ` +
          "Deposit DEEP to the margin manager first (deepbook_margin_deposit with coin_type deep).",
      );
    }
  }

  if (action === "deepbook_margin_submit_proposal") {
    readNonNegativeNumber(params, "taker_fee", "takerFee");
    readNonNegativeNumber(params, "maker_fee", "makerFee");
    readNonNegativeNumber(params, "stake_required", "stakeRequired", "stake_required_deep");
  }

  if (action === "deepbook_margin_vote") {
    parseProposalId(params);
  }
}

export async function executeMarginStake(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<MarginExecResult> {
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const { managerKey, marginManagerAddress, poolKey } = await resolveMarginManagerKey(
    privyUserId,
    wallet.address,
    params,
  );
  const stakeAmount = readPositiveAmount(params);

  const result = await buildAndSignExecute(
    privyUserId,
    wallet.address,
    (tx, client) => {
      tx.add(client.poolProxy.stake(managerKey, stakeAmount));
    },
    marginManagerAddress,
    managerKey,
    poolKey,
  );

  return {
    ...result,
    margin: {
      action: "stake",
      margin_manager: marginManagerAddress,
      pool_key: poolKey,
      amount: stakeAmount,
      coin_type: "deep",
    },
  };
}

export async function executeMarginUnstake(
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
      tx.add(client.poolProxy.unstake(managerKey));
    },
    marginManagerAddress,
    managerKey,
    poolKey,
  );

  return {
    ...result,
    margin: {
      action: "unstake",
      margin_manager: marginManagerAddress,
      pool_key: poolKey,
      coin_type: "deep",
    },
  };
}

export async function executeMarginSubmitProposal(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<MarginExecResult> {
  await assertGovernanceEnabled(privyUserId);
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const { managerKey, marginManagerAddress, poolKey } = await resolveMarginManagerKey(
    privyUserId,
    wallet.address,
    params,
  );
  const takerFee = readNonNegativeNumber(params, "taker_fee", "takerFee");
  const makerFee = readNonNegativeNumber(params, "maker_fee", "makerFee");
  const stakeRequired = readNonNegativeNumber(
    params,
    "stake_required",
    "stakeRequired",
    "stake_required_deep",
  );

  const result = await buildAndSignExecute(
    privyUserId,
    wallet.address,
    (tx, client) => {
      tx.add(
        client.poolProxy.submitProposal(managerKey, {
          takerFee,
          makerFee,
          stakeRequired,
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
      action: "submit_proposal",
      margin_manager: marginManagerAddress,
      pool_key: poolKey,
    },
  };
}

export async function executeMarginVote(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<MarginExecResult> {
  await assertGovernanceEnabled(privyUserId);
  const wallet = await resolveSuiAgentWallet(privyUserId);
  const { managerKey, marginManagerAddress, poolKey } = await resolveMarginManagerKey(
    privyUserId,
    wallet.address,
    params,
  );
  const proposalId = parseProposalId(params);

  const result = await buildAndSignExecute(
    privyUserId,
    wallet.address,
    (tx, client) => {
      tx.add(client.poolProxy.vote(managerKey, proposalId));
    },
    marginManagerAddress,
    managerKey,
    poolKey,
  );

  return {
    ...result,
    margin: {
      action: "vote",
      margin_manager: marginManagerAddress,
      pool_key: poolKey,
    },
  };
}

export async function executeMarginClaimRebate(
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
      tx.add(client.poolProxy.claimRebate(managerKey));
    },
    marginManagerAddress,
    managerKey,
    poolKey,
  );

  return {
    ...result,
    margin: {
      action: "claim_rebate",
      margin_manager: marginManagerAddress,
      pool_key: poolKey,
    },
  };
}
