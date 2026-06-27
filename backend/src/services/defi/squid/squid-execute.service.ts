import { isSquidEnabled } from "../../../config/squid.js";
import { AppError } from "../../../errors/app-error.js";
import { isDeFiQuoteExpired } from "../../agent-transaction/approval-preview/quote-expiry.js";
import {
  listAgentWalletsForPrivyUser,
  resolveAgentWalletByPrivyUserId,
} from "../../wallet/agent-wallet.service.js";
import type { ResolvedAgentWallet } from "../../wallet/wallet.types.js";
import type { ChainId } from "../../chains/types.js";
import { executeSquidApproval, assertSquidExecuteCorridorSupported } from "./squid-approval.service.js";
import { storeSquidRoute } from "./squid-cache.js";
import { mapSquidExecuteError } from "./squid.errors.js";
import {
  assertSquidRouteExecutable,
  executeSquidChainflipDepositRoute,
  executeSquidEvmRouteManually,
  executeSquidSolanaRouteManually,
  executeSquidSuiRouteManually,
  isSquidChainflipDepositRoute,
  readOnChainExecutionTarget,
  squidRouteHasTransactionData,
} from "./squid-execute-providers.service.js";
import {
  refreshSquidRouteAtExecute,
  resolveDestinationChainFromSquidStored,
  resolveSourceChainFromSquidExecuteInput,
  resolveSquidRouteForExecute,
} from "./squid-quote.service.js";
import { resolveSquidTokens } from "./squid-input.js";
import { consumeSquidExecuteQuota } from "./squid-rate-limit.js";
import { resolveSquidWalletAddresses } from "./squid-wallet-addresses.js";
import type { SquidExecuteInput, SquidExecuteResult } from "./squid.types.js";

async function resolveAgentWallet(privyUserId: string, chainId: ChainId) {
  const agentWallet = await resolveAgentWalletByPrivyUserId(privyUserId, chainId);
  if (!agentWallet) {
    throw new AppError(
      404,
      "WALLET_NOT_FOUND",
      `Agent wallet not registered for chain ${chainId}.`,
    );
  }
  if (!agentWallet.signer_added) {
    throw new AppError(403, "WALLET_SIGNER_NOT_CONFIGURED", "Session signer not configured.");
  }
  return agentWallet;
}

export async function executeSquidCrossChainSwap(
  privyUserId: string,
  input: SquidExecuteInput,
): Promise<SquidExecuteResult> {
  if (!isSquidEnabled()) {
    throw new AppError(503, "SQUID_UNAVAILABLE", "Squid is not enabled on this deployment.");
  }

  await consumeSquidExecuteQuota(privyUserId);
  return runSquidCrossChainSwap(privyUserId, input);
}

async function runSquidCrossChainSwap(
  privyUserId: string,
  input: SquidExecuteInput,
): Promise<SquidExecuteResult> {
  const stored = await resolveSquidRouteForExecute({
    routeId: input.route_id,
    squidRoute: input.squid_route,
    privyUserId,
    snapshotParams: input as unknown as Record<string, unknown>,
  });

  assertSquidExecuteCorridorSupported(stored);

  const sourceChain = resolveSourceChainFromSquidExecuteInput({
    from_chain_id: input.from_chain_id,
    from_evm_chain_id: input.from_evm_chain_id,
    stored,
  });
  assertSquidRouteExecutable(stored.route, sourceChain.chain_id);
  const destChain = resolveDestinationChainFromSquidStored(stored);
  const isSameChainEvm =
    sourceChain.chain_id === "ethereum" &&
    destChain.chain_id === "ethereum" &&
    sourceChain.evm_chain_id === destChain.evm_chain_id;

  const { fromAddress, toAddress } = await resolveSquidWalletAddresses(
    privyUserId,
    sourceChain,
    destChain,
  );

  await resolveAgentWallet(privyUserId, sourceChain.chain_id);

  const executeParams = input as unknown as Record<string, unknown>;
  const quoteExpired = isDeFiQuoteExpired(executeParams);
  const missingTxData = !squidRouteHasTransactionData(stored.route);
  let refreshed = stored;
  if (quoteExpired || missingTxData) {
    const tokens = resolveSquidTokens({
      from_chain_id: stored.from_chain_id,
      to_chain_id: stored.to_chain_id,
      from_evm_chain_id: stored.from_evm_chain_id,
      to_evm_chain_id: stored.to_evm_chain_id,
      fromToken: readSnapshotToken(executeParams, "from"),
      toToken: readSnapshotToken(executeParams, "to"),
      amountAtomic:
        readSnapshotString(executeParams, "from_amount_atomic") ??
        stored.route.params?.fromAmount,
      confirmSameToken:
        typeof executeParams.confirm_same_token === "boolean"
          ? executeParams.confirm_same_token
          : undefined,
    });
    refreshed = await refreshSquidRouteAtExecute({
      userId: privyUserId,
      stored,
      tokens,
      fromAddress,
      toAddress,
      slippage: typeof input.slippage === "number" ? input.slippage : undefined,
    });
  }

  const routeId = input.route_id ?? createRouteIdFromStored(refreshed);
  await storeSquidRoute(routeId, refreshed);

  let approvalTxHash: string | null = null;
  if (!input.skip_approval && sourceChain.chain_id === "ethereum") {
    const approval = await executeSquidApproval(privyUserId, {
      stored: refreshed,
      fromAddress,
    });
    approvalTxHash = approval.tx_hash;
    if (approval.effects_status === "failure") {
      throw new AppError(400, "APPROVAL_FAILED", "ERC-20 approval failed before cross-chain swap.");
    }
  }

  const agentWallet = await resolveAgentWallet(privyUserId, sourceChain.chain_id);
  let txHash: string | null = null;
  let evmSwapConfirmed = false;
  let chainflipDeposit: SquidExecuteResult["chainflip_deposit"] | undefined;
  const bridgeStartedAt = new Date().toISOString();

  try {
    if (isSquidChainflipDepositRoute(refreshed.route)) {
      const chainflip = await executeSquidChainflipDepositRoute({
        privyUserId,
        route: refreshed.route,
        quoteId: refreshed.quote_id,
        agentWallet,
        toEvmChainId: destChain.chain_id === "ethereum" ? destChain.evm_chain_id : undefined,
      });
      txHash = chainflip.txHash;
      chainflipDeposit = chainflip.chainflipDeposit;
    } else if (sourceChain.chain_id === "solana") {
      txHash = await executeSquidSolanaRouteManually({
        route: refreshed.route,
        agentWallet,
      });
    } else if (sourceChain.chain_id === "sui") {
      txHash = await executeSquidSuiRouteManually({
        route: refreshed.route,
        agentWallet,
      });
    } else {
      const executed = await executeSquidEvmRouteManually({
        route: refreshed.route,
        agentWallet,
        evmChainId: sourceChain.evm_chain_id,
      });
      txHash = executed.hash;
      evmSwapConfirmed = executed.confirmed;
    }
  } catch (err) {
    throw mapSquidExecuteError(err);
  }

  const txHashes = txHash ? [txHash] : [];
  const duration = refreshed.route.estimate?.estimatedRouteDuration ?? null;
  const effectsStatus =
    isSameChainEvm && evmSwapConfirmed
      ? "success"
      : txHashes.length > 0
        ? "pending"
        : "unknown";

  return {
    route_id: routeId,
    quote_id: refreshed.quote_id,
    request_id: refreshed.request_id ?? null,
    tx_hashes: txHashes,
    effects_status: effectsStatus,
    approval_tx_hash: approvalTxHash,
    bridge_started_at: txHashes.length > 0 ? bridgeStartedAt : null,
    estimated_duration_seconds: duration,
    ...(chainflipDeposit
      ? {
          chainflip_deposit: chainflipDeposit,
          chainflip_status_tracking_id: chainflipDeposit.chainflip_status_tracking_id,
          bridge_type: chainflipDeposit.bridge_type,
        }
      : {}),
  };
}

function readSnapshotString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readSnapshotToken(params: Record<string, unknown>, prefix: "from" | "to"): string {
  return (
    readSnapshotString(params, `${prefix}_token_symbol`) ??
    readSnapshotString(params, `${prefix}_token`) ??
    "USDC"
  );
}

function createRouteIdFromStored(stored: Awaited<ReturnType<typeof resolveSquidRouteForExecute>>): string {
  return `squid:${stored.quote_id.slice(0, 16)}`;
}

export async function preflightSquidQuoteNotExpired(
  expiresAt: string | null | undefined,
): Promise<void> {
  if (!expiresAt) {
    return;
  }
  if (Date.now() >= Date.parse(expiresAt)) {
    throw new AppError(
      400,
      "SQUID_VALIDATION_ERROR",
      "Quote expired. Fetch a fresh cross_chain_quote before executing.",
    );
  }
}

export async function resolveAgentWalletMap(
  privyUserId: string,
): Promise<Partial<Record<"sui" | "solana" | "ethereum" | "stellar", ResolvedAgentWallet>>> {
  const wallets = await listAgentWalletsForPrivyUser(privyUserId);
  const map: Partial<Record<"sui" | "solana" | "ethereum" | "stellar", ResolvedAgentWallet>> = {};

  for (const wallet of wallets) {
    const chainType = wallet.chain_type as ChainId;
    if (
      chainType === "sui" ||
      chainType === "solana" ||
      chainType === "ethereum" ||
      chainType === "stellar"
    ) {
      map[chainType] = {
        chain_type: chainType,
        address: wallet.address,
        privy_wallet_id: wallet.privy_wallet_id,
        signer_added: wallet.signer_added,
      };
    }
  }

  return map;
}
