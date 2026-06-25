import type { Route } from "@lifi/types";
import type { ExecuteTransactionInput, TxResult } from "../../chains/types.js";
import { applyLifiRouteToExecuteParams } from "../../agent-transaction/approval-preview/enrichers/lifi-route-params.js";
import { pendingTransactionFromRecord } from "../../agent-transaction/agent-transaction.service.js";
import { findAgentTransactionsBySessionForUser } from "../../agent-transaction/agent-transaction.repository.js";
import type { AgentTransactionRecord } from "../../agent-transaction/agent-transaction.types.js";
import { findUserByPrivyId } from "../../auth/user.repository.js";
import type { PendingTransaction } from "../../agent/agent.types.js";
import { getStoredLifiRoute } from "./lifi-cache.js";
import {
  buildLifiContinuationExecuteInput,
  isLifiContinuationApproval,
} from "./lifi-continuation.js";
import { isExecutableLifiRoute } from "./lifi-normalize.js";
import {
  isTerminalLifiStatus,
  readLifiPendingStepFromTxResult,
} from "./lifi-tracking.js";
import type { LifiTrackingMeta } from "./lifi-tracking.types.js";
import type { CrossChainStatusResult } from "./lifi.types.js";
import { isLifiExecuteAction } from "../../agent/chains/evm/lifi/execute-actions.js";

/** Standard pending-approval TTL — mirrored from agent-transaction.service. */
export const STANDARD_PENDING_APPROVAL_TTL_MS = 15 * 60 * 1000;

/** Minimum TTL for destination-chain continuation approvals (15 min). */
export const LIFI_CONTINUATION_APPROVAL_MIN_TTL_MS = STANDARD_PENDING_APPROVAL_TTL_MS;

/** Buffer after bridge ETA before continuation approval expires. */
export const LIFI_CONTINUATION_APPROVAL_BUFFER_MS = 30 * 60 * 1000;

export function resolveLifiContinuationApprovalTtlMs(
  estimatedDurationSeconds: number | null | undefined,
): number {
  if (estimatedDurationSeconds == null || estimatedDurationSeconds <= 0) {
    return LIFI_CONTINUATION_APPROVAL_MIN_TTL_MS;
  }
  const etaMs = estimatedDurationSeconds * 1000;
  return Math.max(
    LIFI_CONTINUATION_APPROVAL_MIN_TTL_MS,
    etaMs + LIFI_CONTINUATION_APPROVAL_BUFFER_MS,
  );
}

function readEstimatedDurationSeconds(params: Record<string, unknown>): number | null {
  const raw = params.estimated_duration_seconds;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Cutoff timestamp — rows created before this are expired for the given params. */
export function resolvePendingApprovalCutoff(
  params: Record<string, unknown>,
  nowMs = Date.now(),
): Date {
  if (isLifiContinuationApproval(params)) {
    const ttl = resolveLifiContinuationApprovalTtlMs(
      readEstimatedDurationSeconds(params),
    );
    return new Date(nowMs - ttl);
  }
  return new Date(nowMs - STANDARD_PENDING_APPROVAL_TTL_MS);
}

export function isPendingApprovalExpired(
  params: Record<string, unknown>,
  createdAt: Date,
  nowMs = Date.now(),
): boolean {
  return createdAt < resolvePendingApprovalCutoff(params, nowMs);
}

const DESTINATION_ACTION_SUBSTATUS = /ACTION|USER|SIGN|DESTINATION/i;

export function isLifiTrackingContinuationNeeded(
  tracking: LifiTrackingMeta,
  status?: CrossChainStatusResult | null,
): boolean {
  if (tracking.pending_step) {
    return true;
  }
  if (status && !isTerminalLifiStatus(status.status)) {
    const substatus = status.substatus ?? "";
    if (DESTINATION_ACTION_SUBSTATUS.test(substatus)) {
      return true;
    }
  }
  return false;
}

export async function findOpenLifiContinuationPending(
  privyUserId: string,
  sessionId: string | null | undefined,
  routeId: string,
): Promise<AgentTransactionRecord | null> {
  if (!sessionId) {
    return null;
  }

  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    return null;
  }

  const rows = await findAgentTransactionsBySessionForUser(sessionId, user.id);
  const matches = rows.filter((row) => {
    if (row.status !== "pending_approval") {
      return false;
    }
    const params = row.params as Record<string, unknown>;
    if (!isLifiContinuationApproval(params)) {
      return false;
    }
    return params.route_id === routeId;
  });

  const claimable = matches.filter(
    (row) => !isPendingApprovalExpired(row.params as Record<string, unknown>, row.created_at),
  );

  return claimable.at(-1) ?? null;
}

async function resolveLifiRouteForContinuation(
  routeId: string,
  params: Record<string, unknown>,
  parentParams?: Record<string, unknown>,
): Promise<Route | null> {
  const candidates = [
    params.lifi_route,
    params.route,
    parentParams?.lifi_route,
    parentParams?.route,
  ];
  for (const candidate of candidates) {
    if (isExecutableLifiRoute(candidate)) {
      return candidate;
    }
  }
  const stored = await getStoredLifiRoute(routeId);
  return isExecutableLifiRoute(stored) ? stored : null;
}

async function embedLifiRouteInContinuationParams(
  params: Record<string, unknown>,
  routeId: string,
  parentParams?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const route = await resolveLifiRouteForContinuation(routeId, params, parentParams);
  if (!route) {
    return params;
  }
  return applyLifiRouteToExecuteParams(params, route);
}

export type PrepareLifiContinuationInput = {
  parentParams?: Record<string, unknown>;
  executeInput?: ExecuteTransactionInput;
  tracking: LifiTrackingMeta;
  status?: CrossChainStatusResult | null;
  result?: TxResult | null;
};

/** Build execute input for a destination-chain continuation, or null when not applicable. */
export async function prepareLifiContinuationExecuteInput(
  input: PrepareLifiContinuationInput,
): Promise<ExecuteTransactionInput | null> {
  if (!isLifiTrackingContinuationNeeded(input.tracking, input.status)) {
    return null;
  }

  const pendingStep =
    input.tracking.pending_step ?? readLifiPendingStepFromTxResult(input.result ?? null);
  if (!pendingStep) {
    return null;
  }

  const routeId = input.tracking.route_id;
  if (!routeId) {
    return null;
  }

  const parentParams = input.parentParams ?? input.executeInput?.params ?? {};
  const priorInput: ExecuteTransactionInput =
    input.executeInput ??
    ({
      chain_id:
        typeof parentParams.from_chain_id === "string"
          ? parentParams.from_chain_id
          : "ethereum",
      action: "cross_chain_swap",
      params: parentParams,
    } as ExecuteTransactionInput);

  if (!isLifiExecuteAction(priorInput.action)) {
    return null;
  }

  let continuationInput = buildLifiContinuationExecuteInput(
    priorInput,
    pendingStep,
    routeId,
  );

  continuationInput = {
    ...continuationInput,
    params: await embedLifiRouteInContinuationParams(
      continuationInput.params,
      routeId,
      parentParams,
    ),
  };

  return continuationInput;
}

export type MaybeCreateLifiContinuationInput = PrepareLifiContinuationInput & {
  privyUserId: string;
  sessionId: string | null | undefined;
  routeId?: string;
};

/** Returns existing open continuation pending if one already exists for the route. */
export async function findExistingLifiContinuationPending(
  input: MaybeCreateLifiContinuationInput,
): Promise<PendingTransaction | null> {
  const routeId = input.routeId ?? input.tracking.route_id;
  if (!routeId) {
    return null;
  }
  const existing = await findOpenLifiContinuationPending(
    input.privyUserId,
    input.sessionId,
    routeId,
  );
  return existing ? pendingTransactionFromRecord(existing) : null;
}
