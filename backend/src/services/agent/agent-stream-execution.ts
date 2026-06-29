import { mapAgentToolError } from "../../utils/agent-tool-errors.js";
import type { ExecuteTransactionInput } from "../chains/types.js";
import type { ExecuteToolOutcome } from "./agent.types.js";
import { emitAgentEvent, hasAgentStreamSubscribers } from "./agent-stream.service.js";
import { bufferPendingExecuteInApp } from "./agent-stream-pending-execute.js";
import type { AgentToolOptions } from "./execute-transaction-context.js";

export type AgentStreamBroadcastContext = {
  sessionId?: string;
  broadcast?: boolean;
};

export function shouldBroadcastAgentStream(ctx: AgentStreamBroadcastContext): boolean {
  return Boolean(ctx.sessionId && ctx.broadcast);
}

export function agentStreamContextFromToolOptions(opts: AgentToolOptions): AgentStreamBroadcastContext {
  return {
    sessionId: opts.sessionId,
    broadcast: opts.broadcast === true,
  };
}

export function resolveAgentStreamAction(input: ExecuteTransactionInput): string {
  return input.action;
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

export function emitAgentStreamExecuteInApp(
  ctx: AgentStreamBroadcastContext,
  action: string,
  params: Record<string, unknown>,
): void {
  if (!shouldBroadcastAgentStream(ctx) || !ctx.sessionId) {
    return;
  }

  const sessionId = ctx.sessionId;

  if (hasAgentStreamSubscribers(sessionId)) {
    emitAgentEvent(sessionId, "agent_thinking", { active: true, action });
    emitAgentEvent(sessionId, "agent_action", {
      action,
      params,
      step: "execute_in_app",
      animate: true,
    });
    emitAgentEvent(sessionId, "agent_thinking", { active: false, action });
    return;
  }

  bufferPendingExecuteInApp(sessionId, action, params);
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
    return;
  }

  if (outcome.status === "liquidity_fallback_offered" && outcome.liquidity_fallback_offer) {
    emitAgentEvent(ctx.sessionId, "agent_action", {
      action,
      step: "liquidity_fallback_offered",
      pending: outcome.pending as unknown as Record<string, unknown>,
    });
    emitAgentEvent(ctx.sessionId, "agent_thinking", { active: false, action });
    return;
  }

  if (outcome.status === "stellar_routing_fallback_offered" && outcome.stellar_routing_fallback_offer) {
    emitAgentEvent(ctx.sessionId, "agent_action", {
      action,
      step: "stellar_routing_fallback_offered",
      pending: outcome.pending as unknown as Record<string, unknown>,
    });
    emitAgentEvent(ctx.sessionId, "agent_thinking", { active: false, action });
    return;
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
