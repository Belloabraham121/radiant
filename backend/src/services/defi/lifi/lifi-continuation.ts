import type { Route } from "@lifi/types";
import type { ExecuteTransactionInput } from "../../chains/types.js";
import { lifiToRadiantChainRef } from "./lifi-chain-map.js";
import type { LifiPendingStepMeta } from "./lifi-tracking.types.js";

function readStepExecutionStatus(step: Route["steps"][number]): string | undefined {
  const execution = (step as { execution?: { status?: string } }).execution;
  return execution?.status;
}

/** True when a Li-Fi route is mid-execution and needs a follow-up on-chain signature. */
export function isLifiRouteContinuation(route: Route): boolean {
  let priorDone = false;
  for (const step of route.steps ?? []) {
    const status = readStepExecutionStatus(step);
    if (status === "DONE") {
      priorDone = true;
      continue;
    }
    if (status === "ACTION_REQUIRED") {
      return true;
    }
    if (priorDone && status === "PENDING") {
      return true;
    }
  }
  return false;
}

export function isLifiContinuationApproval(params: Record<string, unknown>): boolean {
  if (params.lifi_continuation === true) {
    return true;
  }
  const kind = params.approval_kind;
  return kind === "lifi_continue" || kind === "lifi_continuation";
}

export function markLifiContinuationParams(params: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...params,
    lifi_continuation: true,
    approval_kind: "lifi_continue",
  };
  delete next.expires_at;
  delete next.quote_expires_at;
  return next;
}

export function buildLifiContinuationExecuteInput(
  priorInput: ExecuteTransactionInput,
  pendingStep: LifiPendingStepMeta,
  routeId: string,
): ExecuteTransactionInput {
  const destChainRef = lifiToRadiantChainRef(pendingStep.chain_id);
  return {
    chain_id: destChainRef.chain_id,
    ...(destChainRef.chain_id === "ethereum" && destChainRef.evm_chain_id !== undefined
      ? { evm_chain_id: destChainRef.evm_chain_id }
      : {}),
    action: "cross_chain_swap",
    params: markLifiContinuationParams({
      ...priorInput.params,
      route_id: routeId,
      lifi_pending_step_index: pendingStep.step_index,
    }),
  };
}
