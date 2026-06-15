import { mapAgentToolError } from "../../utils/agent-tool-errors.js";
import type { ExecuteTransactionInput } from "../chains/types.js";
import { mapExecuteActionToAppActionName } from "../projects/app-action-mapper.js";
import type { AppActionContext } from "../projects/app-action.types.js";
import type { ExecuteToolOutcome } from "./agent.types.js";
import { emitAgentEvent, hasAgentStreamSubscribers } from "./agent-stream.service.js";
import type { AgentToolOptions } from "./execute-transaction-context.js";

export type AgentStreamBroadcastContext = {
  sessionId?: string;
  broadcast?: boolean;
};

export function shouldBroadcastAgentStream(ctx: AgentStreamBroadcastContext): boolean {
  return Boolean(ctx.sessionId && ctx.broadcast && hasAgentStreamSubscribers(ctx.sessionId));
}

export function agentStreamContextFromAppAction(ctx: AppActionContext): AgentStreamBroadcastContext {
  return {
    sessionId: ctx.sessionId,
    broadcast: ctx.source === "agent" && Boolean(ctx.sessionId),
  };
}

export function agentStreamContextFromToolOptions(opts: AgentToolOptions): AgentStreamBroadcastContext {
  return {
    sessionId: opts.sessionId,
    broadcast: opts.broadcast === true,
  };
}

export function resolveAgentStreamAction(input: ExecuteTransactionInput): string {
  return mapExecuteActionToAppActionName(input.action) ?? input.action;
}

function emitAgentStreamSteps(
  sessionId: string,
  action: string,
  params: Record<string, unknown>,
): void {
  if (action === "swap") {
    const amount = params.amount ?? params.amount_display;
    if (amount != null) {
      emitAgentEvent(sessionId, "agent_step", { action, target: "amount-in", value: amount });
    }
    if (params.side != null) {
      emitAgentEvent(sessionId, "agent_step", { action, target: "side", value: params.side });
    }
    return;
  }

  if ((action === "stake" || action === "unstake") && params.amount_display != null) {
    emitAgentEvent(sessionId, "agent_step", {
      action,
      target: "amount-in",
      value: params.amount_display,
    });
  }
}

export function emitAgentStreamExecutionStart(
  ctx: AgentStreamBroadcastContext,
  action: string,
  params: Record<string, unknown>,
): void {
  if (!shouldBroadcastAgentStream(ctx) || !ctx.sessionId) {
    return;
  }

  emitAgentEvent(ctx.sessionId, "agent_thinking", { active: true, action });
  emitAgentEvent(ctx.sessionId, "agent_action", { action, params, animate: true });
  emitAgentStreamSteps(ctx.sessionId, action, params);
}

export function emitAgentStreamExecutionOutcome(
  ctx: AgentStreamBroadcastContext,
  action: string,
  outcome: ExecuteToolOutcome,
): void {
  if (!shouldBroadcastAgentStream(ctx) || !ctx.sessionId) {
    return;
  }

  if (outcome.status === "executed") {
    emitAgentEvent(ctx.sessionId, "agent_done", {
      action,
      digest: outcome.result.digest,
      refresh: true,
    });
    emitAgentEvent(ctx.sessionId, "agent_thinking", { active: false, action });
    return;
  }

  if (outcome.status === "approval_required") {
    emitAgentEvent(ctx.sessionId, "agent_action", {
      action,
      step: "approval_required",
      pending: outcome.pending as unknown as Record<string, unknown>,
    });
    emitAgentEvent(ctx.sessionId, "agent_thinking", { active: false, action });
  }
}

export function emitAgentStreamExecutionError(
  ctx: AgentStreamBroadcastContext,
  action: string,
  err: unknown,
): void {
  if (!shouldBroadcastAgentStream(ctx) || !ctx.sessionId) {
    return;
  }

  const mapped = mapAgentToolError(err);
  emitAgentEvent(ctx.sessionId, "agent_error", {
    action,
    code: mapped.code,
    message: mapped.message,
  });
  emitAgentEvent(ctx.sessionId, "agent_thinking", { active: false, action });
}
