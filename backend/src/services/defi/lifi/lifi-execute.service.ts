import { convertQuoteToRoute, executeRoute, type RouteExtended } from "@lifi/sdk";
import type { Route } from "@lifi/types";
import type { Hex } from "viem";
import { getLifiSdkClient } from "./lifi.client.js";
import { AppError } from "../../../errors/app-error.js";
import { isLifiEnabled } from "../../../config/lifi.js";
import { getEvmPublicClient } from "../../../infrastructure/evm/client.js";
import {
  listAgentWalletsForPrivyUser,
  resolveAgentWalletByPrivyUserId,
} from "../../wallet/agent-wallet.service.js";
import {
  buildQuoteRefreshParams,
  getLifiQuote,
  resolveLifiRouteForExecute,
  resolveSourceChainFromExecuteInput,
} from "./lifi-quote.service.js";
import { lifiSdk } from "./lifi.client.js";
import { consumeLifiExecuteQuota } from "./lifi-rate-limit.js";
import {
  checkLifiApprovalRequired,
  executeLifiApproval,
} from "./lifi-approval.service.js";
import { lifiToRadiantChainRef } from "./lifi-chain-map.js";
import { storeLifiRoute } from "./lifi-cache.js";
import { createRouteId } from "./lifi-normalize.js";
import { resolveLifiBridgeWalletAddresses } from "./lifi-wallet-addresses.js";
import { isLifiContinuationApproval } from "../../agent-transaction/approval-preview/quote-expiry.js";
import { buildLifiSdkProvidersForRoute } from "./lifi-providers.service.js";
import { getLifiExecuteContext } from "./lifi-execute-context.js";
import { emitAgentStreamExecutionStep } from "../../agent/agent-stream-lifi.js";
import {
  lifiBridgeStepLabel,
  lifiCountdownStepFields,
} from "./lifi-countdown.js";
import type { LifiTrackingMeta } from "./lifi-tracking.types.js";
import { mapLifiExecuteError } from "./lifi.errors.js";
import {
  executeSameChainEvmLifiRoute,
  isSameChainEvmLifiRoute,
} from "./lifi-same-chain-execute.service.js";
import { isSameChainLifiChainRefs } from "./lifi-tracking.js";
import type { LifiExecuteInput, LifiExecuteResult } from "./lifi.types.js";
import type { ResolvedAgentWallet } from "../../wallet/wallet.types.js";
import type { ChainId } from "../../chains/types.js";

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

async function resolveAgentWalletMap(
  privyUserId: string,
): Promise<Partial<Record<"sui" | "solana" | "ethereum", ResolvedAgentWallet>>> {
  const wallets = await listAgentWalletsForPrivyUser(privyUserId);
  const map: Partial<Record<"sui" | "solana" | "ethereum", ResolvedAgentWallet>> = {};

  for (const wallet of wallets) {
    const chainType = wallet.chain_type as ChainId;
    if (chainType === "sui" || chainType === "solana" || chainType === "ethereum") {
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

function collectRouteChainIds(route: Route): number[] {
  const ids = new Set<number>();
  for (const step of route.steps) {
    ids.add(step.action.fromChainId);
    ids.add(step.action.toChainId);
  }
  return [...ids];
}

async function refreshRouteAtExecute(
  route: Route,
  fromAddress: string,
  toAddress: string,
): Promise<Route> {
  const refreshParams = buildQuoteRefreshParams(route, fromAddress, toAddress);
  const freshStep = await lifiSdk.getQuote(refreshParams);
  const routeId = route.id ?? createRouteId(JSON.stringify(refreshParams));
  const refreshed = convertQuoteToRoute(freshStep);
  return { ...refreshed, id: routeId };
}

function collectTxHashes(route: RouteExtended): string[] {
  const hashes: string[] = [];
  for (const step of route.steps) {
    for (const action of step.execution?.actions ?? []) {
      if (action.txHash) {
        hashes.push(action.txHash);
      }
    }
  }
  return hashes;
}

/** Li-Fi quotes can go stale before the user approves — always re-quote on first execute. */
function shouldRefreshRouteAtExecute(continuation: boolean): boolean {
  return !continuation;
}

async function assertEvmSourceReceiptSucceeded(
  txHash: string,
  evmChainId: number,
): Promise<void> {
  const publicClient = getEvmPublicClient(evmChainId);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as Hex });
  if (receipt.status === "reverted") {
    throw new AppError(
      400,
      "TRANSACTION_FAILED",
      "The swap transaction reverted on chain. The quote may have expired — try again with a fresh quote, or use a slightly smaller amount.",
      { tx_hash: txHash, evm_chain_id: evmChainId },
    );
  }
}

function detectPendingStep(route: RouteExtended): LifiExecuteResult["pending_step"] {
  for (let index = 0; index < route.steps.length; index++) {
    const step = route.steps[index];
    const status = step.execution?.status;
    if (status === "PENDING" || status === "ACTION_REQUIRED") {
      return {
        step_index: index,
        chain_id: step.action.fromChainId,
        action: step.type,
        message:
          "Additional on-chain step required on destination chain. Poll cross_chain_status or continue execution.",
      };
    }
  }
  return null;
}

export async function executeLifiCrossChainSwap(
  privyUserId: string,
  input: LifiExecuteInput,
): Promise<LifiExecuteResult> {
  if (!isLifiEnabled()) {
    throw new AppError(503, "LIFI_UNAVAILABLE", "Li-Fi is not enabled on this deployment.");
  }

  await consumeLifiExecuteQuota(privyUserId);

  return runLifiCrossChainSwap(privyUserId, input);
}

async function runLifiCrossChainSwap(
  privyUserId: string,
  input: LifiExecuteInput,
): Promise<LifiExecuteResult> {
  const storedRoute = await resolveLifiRouteForExecute({
    routeId: input.route_id,
    route: input.route,
    lifiRoute: input.lifi_route,
    privyUserId,
    snapshotParams: input as unknown as Record<string, unknown>,
  });

  const sourceChain = resolveSourceChainFromExecuteInput({
    from_chain_id: input.from_chain_id,
    from_evm_chain_id: input.from_evm_chain_id,
    route: storedRoute,
  });

  const lastStep = storedRoute.steps.at(-1);
  const destChain = lastStep
    ? lifiToRadiantChainRef(lastStep.action.toChainId)
    : sourceChain;

  const { fromAddress, toAddress } = await resolveLifiBridgeWalletAddresses(
    privyUserId,
    sourceChain,
    destChain,
  );

  await resolveAgentWallet(privyUserId, sourceChain.chain_id);

  const continuation = isLifiContinuationApproval(input as unknown as Record<string, unknown>);
  let refreshedRoute = storedRoute;
  if (shouldRefreshRouteAtExecute(continuation)) {
    refreshedRoute = await refreshRouteAtExecute(storedRoute, fromAddress, toAddress);
  }
  const routeId =
    refreshedRoute.id ?? input.route_id ?? createRouteId(JSON.stringify(refreshedRoute));
  await storeLifiRoute(routeId, refreshedRoute);

  let approvalTxHash: string | null = null;
  if (!input.skip_approval && sourceChain.chain_id === "ethereum") {
    const approvalInfo = await checkLifiApprovalRequired(refreshedRoute);
    if (approvalInfo.required && approvalInfo.chainId) {
      const approval = await executeLifiApproval(privyUserId, {
        route: refreshedRoute,
        evmChainId: approvalInfo.chainId,
      });
      approvalTxHash = approval.tx_hash;
      if (approval.effects_status === "failure") {
        throw new AppError(400, "APPROVAL_FAILED", "ERC-20 approval failed before cross-chain swap.");
      }
    }
  }

  const streamCtx = getLifiExecuteContext();
  const sameChainEvmSwap =
    isSameChainEvmLifiRoute(sourceChain, refreshedRoute) &&
    sourceChain.evm_chain_id !== undefined;
  const sameChainSwap = isSameChainLifiChainRefs(sourceChain, destChain);

  let executedRoute: RouteExtended;
  let bridgeCountdownStartedAt: string | null = null;
  let bridgeDurationSeconds: number | null = null;

  if (sameChainEvmSwap) {
    executedRoute = await executeSameChainEvmLifiRoute(
      privyUserId,
      refreshedRoute,
      sourceChain.evm_chain_id!,
    );
    const txHashes = collectTxHashes(executedRoute);
    const digest = txHashes[0];
    if (streamCtx?.sessionId) {
      const sourceEvmChainId = sourceChain.evm_chain_id;
      emitAgentStreamExecutionStep(streamCtx.sessionId, {
        id: "lifi-submit",
        status: digest ? "ok" : "running",
        label: "Submitting",
        detail: digest ? `Swap tx · ${digest.slice(0, 10)}…` : "Broadcasting swap",
        ...(streamCtx.transactionId ? { agent_transaction_id: streamCtx.transactionId } : {}),
        ...(digest
          ? {
              digest,
              chain_id: sourceChain.chain_id,
              ...(sourceEvmChainId !== undefined ? { evm_chain_id: sourceEvmChainId } : {}),
            }
          : {}),
        status_category: "defi",
      });
    }
  } else {
    const client = getLifiSdkClient();
    const agentWallets = await resolveAgentWalletMap(privyUserId);
    const providers = await buildLifiSdkProvidersForRoute({
      sourceChainId: sourceChain.chain_id,
      routeChainIds: collectRouteChainIds(refreshedRoute),
      agentWallets,
    });
    client.setProviders(providers);

    try {
      executedRoute = await executeRoute(client, refreshedRoute, {
      updateRouteHook: (updatedRoute) => {
        if (!streamCtx?.sessionId) {
          return;
        }
        const txHashes = collectTxHashes(updatedRoute);
        const digest = txHashes[0];
        const sourceEvmChainId =
          sourceChain.chain_id === "ethereum" ? sourceChain.evm_chain_id : undefined;
        emitAgentStreamExecutionStep(streamCtx.sessionId, {
          id: "lifi-submit",
          status: digest ? "ok" : "running",
          label: "Submitting",
          detail: digest ? `Source tx · ${digest.slice(0, 10)}…` : "Broadcasting source transaction",
          ...(streamCtx.transactionId
            ? { agent_transaction_id: streamCtx.transactionId }
            : {}),
          ...(digest
            ? {
                digest,
                chain_id: sourceChain.chain_id,
                ...(sourceEvmChainId !== undefined ? { evm_chain_id: sourceEvmChainId } : {}),
              }
            : {}),
          status_category: "defi",
        });

        if (!digest || sameChainSwap) {
          return;
        }

        const durationSeconds = refreshedRoute.steps.reduce(
          (max, step) => Math.max(max, step.estimate.executionDuration ?? 0),
          0,
        );
        if (durationSeconds > 0 && bridgeDurationSeconds == null) {
          bridgeDurationSeconds = durationSeconds;
        }
        if (!bridgeCountdownStartedAt) {
          bridgeCountdownStartedAt = new Date().toISOString();
        }

        const tracking: LifiTrackingMeta = {
          route_id: routeId,
          tx_hashes: txHashes,
          from_chain_id: sourceChain.chain_id,
          to_chain_id: destChain.chain_id,
          ...(sourceChain.chain_id === "ethereum" && sourceChain.evm_chain_id !== undefined
            ? { from_evm_chain_id: sourceChain.evm_chain_id }
            : {}),
          ...(destChain.chain_id === "ethereum" && destChain.evm_chain_id !== undefined
            ? { to_evm_chain_id: destChain.evm_chain_id }
            : {}),
          bridge_tool: null,
          estimated_duration_seconds: bridgeDurationSeconds,
          bridge_started_at: bridgeCountdownStartedAt,
          tracking_status: "PENDING",
          substatus: null,
          substatus_message: null,
          receiving_tx_hash: null,
        };
        emitAgentStreamExecutionStep(streamCtx.sessionId, {
          id: "lifi-bridge",
          status: "running",
          label: lifiBridgeStepLabel(tracking, "running"),
          detail: "Waiting for destination confirmation",
          ...(streamCtx.transactionId
            ? { agent_transaction_id: streamCtx.transactionId }
            : {}),
          status_category: "defi",
          ...lifiCountdownStepFields(tracking),
        });
      },
    });
    } catch (err) {
      throw mapLifiExecuteError(err);
    }

    const txHashes = collectTxHashes(executedRoute);
    if (sourceChain.evm_chain_id !== undefined && txHashes[0]) {
      await assertEvmSourceReceiptSucceeded(txHashes[0], sourceChain.evm_chain_id);
    }
  }

  const txHashes = collectTxHashes(executedRoute);

  const pendingStep = detectPendingStep(executedRoute);
  const lastStatus = executedRoute.steps.at(-1)?.execution?.status;

  let effectsStatus: LifiExecuteResult["effects_status"] = "unknown";
  if (lastStatus === "DONE") {
    effectsStatus = pendingStep ? "pending" : "success";
  } else if (lastStatus === "FAILED") {
    effectsStatus = "failure";
  } else if (lastStatus === "PENDING" || pendingStep) {
    effectsStatus = "pending";
  }

  return {
    route_id: routeId,
    tx_hashes: txHashes,
    effects_status: effectsStatus,
    pending_step: pendingStep,
    approval_tx_hash: approvalTxHash,
    bridge_started_at: bridgeCountdownStartedAt,
    estimated_duration_seconds:
      bridgeDurationSeconds ??
      (refreshedRoute.steps.reduce(
        (max, step) => Math.max(max, step.estimate.executionDuration ?? 0),
        0,
      ) || null),
  };
}

/** Re-validate quote expiry before approval-only flow. */
export async function preflightLifiQuoteNotExpired(expiresAt: string | null | undefined): Promise<void> {
  if (!expiresAt) {
    return;
  }
  if (Date.now() >= Date.parse(expiresAt)) {
    throw new AppError(
      400,
      "LIFI_VALIDATION_ERROR",
      "Quote expired. Fetch a fresh cross_chain_quote before executing.",
    );
  }
}

export { getLifiQuote };
