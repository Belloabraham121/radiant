import { convertQuoteToRoute, executeRoute, type RouteExtended } from "@lifi/sdk";
import type { Route } from "@lifi/types";
import { getLifiSdkClient } from "./lifi.client.js";
import { AppError } from "../../../errors/app-error.js";
import { isLifiEnabled } from "../../../config/lifi.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import {
  buildQuoteRefreshParams,
  getLifiQuote,
  resolveLifiRouteForExecute,
} from "./lifi-quote.service.js";
import { lifiSdk } from "./lifi.client.js";
import { consumeLifiExecuteQuota } from "./lifi-rate-limit.js";
import {
  checkLifiApprovalRequired,
  createLifiEthereumProvider,
  executeLifiApproval,
} from "./lifi-approval.service.js";
import { storeLifiRoute } from "./lifi-cache.js";
import { createRouteId } from "./lifi-normalize.js";
import type { LifiExecuteInput, LifiExecuteResult } from "./lifi.types.js";

async function resolveAgentWallet(privyUserId: string) {
  const agentWallet = await resolveAgentWalletByPrivyUserId(privyUserId, "ethereum");
  if (!agentWallet) {
    throw new AppError(404, "WALLET_NOT_FOUND", "EVM agent wallet not registered.");
  }
  if (!agentWallet.signer_added) {
    throw new AppError(403, "WALLET_SIGNER_NOT_CONFIGURED", "Session signer not configured.");
  }
  return agentWallet;
}

async function refreshRouteAtExecute(route: Route, fromAddress: string): Promise<Route> {
  const refreshParams = buildQuoteRefreshParams(route, fromAddress);
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

  const agentWallet = await resolveAgentWallet(privyUserId);
  const storedRoute = await resolveLifiRouteForExecute({
    routeId: input.route_id,
    route: input.route,
  });

  const refreshedRoute = await refreshRouteAtExecute(storedRoute, agentWallet.address);
  const routeId = refreshedRoute.id ?? input.route_id ?? createRouteId(JSON.stringify(refreshedRoute));
  await storeLifiRoute(routeId, refreshedRoute);

  let approvalTxHash: string | null = null;
  if (!input.skip_approval) {
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

  const client = getLifiSdkClient();
  const provider = createLifiEthereumProvider(agentWallet.privy_wallet_id, agentWallet.address);
  client.setProviders([provider]);

  let executedRoute: RouteExtended;
  try {
    executedRoute = await executeRoute(client, refreshedRoute, {
      updateRouteHook: () => undefined,
    });
  } catch (err) {
    throw new AppError(400, "TRANSACTION_FAILED", "Cross-chain route execution failed.", {
      cause: err instanceof Error ? err.message : String(err),
    });
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
