import { mapAgentToolError } from "../../utils/agent-tool-errors.js";
import { buildExplorerTxUrl } from "../agent-transaction/explorer-url.js";
import type { ExecuteToolOutcome } from "../agent/agent.types.js";
import { isExecutePendingUserAction } from "../agent/agent.types.js";
import type { AgentToolOptions } from "../agent/execute-transaction-context.js";
import type {
  AppActionContext,
  AppActionName,
  AppActionResult,
} from "./app-action.types.js";

/** Build execute_transaction options from app action context (ledger correlation). */
export function buildAgentToolOptionsFromContext(ctx: AppActionContext): AgentToolOptions {
  return {
    sessionId: ctx.sessionId,
    messageId: ctx.messageId,
    approved: ctx.approved,
    pinnedAppScope: ctx.pinnedAppScope ?? null,
    source: ctx.source,
    broadcast: ctx.source === "agent" && Boolean(ctx.sessionId),
  };
}

/** Map chat execute outcome to normalized app action result. */
export function mapExecuteOutcomeToAppActionResult(
  action: AppActionName,
  outcome: ExecuteToolOutcome,
): AppActionResult {
  if (outcome.status === "approval_required") {
    const agentTransactionId = outcome.agent_transaction_id ?? outcome.pending.id;
    return {
      status: "approval_required",
      action,
      agent_transaction_id: agentTransactionId,
      pending: outcome.pending,
    };
  }

  if (outcome.status === "liquidity_fallback_offered") {
    const agentTransactionId = outcome.agent_transaction_id ?? outcome.pending.id;
    return {
      status: "approval_required",
      action,
      agent_transaction_id: agentTransactionId,
      pending: {
        ...outcome.pending,
        approval_outcome: "liquidity_fallback_offered",
        liquidity_fallback_offer: outcome.liquidity_fallback_offer,
      },
    };
  }

  if (outcome.status !== "executed") {
    throw new Error("Unexpected execute tool outcome");
  }

  return {
    status: "executed",
    action,
    result: outcome.result,
    digest: outcome.result.digest,
    explorer_url: buildExplorerTxUrl(outcome.result.chain_id, outcome.result.digest),
    ...(outcome.agent_transaction_id ? { agent_transaction_id: outcome.agent_transaction_id } : {}),
  };
}

/** Map thrown errors to app action error result (same codes as agent tools). */
export function mapThrownErrorToAppActionResult(
  action: AppActionName,
  err: unknown,
): AppActionResult {
  const mapped = mapAgentToolError(err);
  return {
    status: "error",
    action,
    error: {
      code: mapped.code,
      message: mapped.message,
      ...(mapped.details !== undefined ? { details: mapped.details } : {}),
    },
  };
}

/** Convert app action result to chat-compatible execute tool outcome when successful. */
export function appActionResultToExecuteToolOutcome(
  result: AppActionResult,
): ExecuteToolOutcome | null {
  if (result.status === "executed") {
    return {
      status: "executed",
      result: result.result,
      ...(result.agent_transaction_id ? { agent_transaction_id: result.agent_transaction_id } : {}),
    };
  }
  if (result.status === "approval_required") {
    return {
      status: "approval_required",
      pending: result.pending,
      agent_transaction_id: result.agent_transaction_id,
    };
  }
  return null;
}
