"use client";

import type { ExecutionStep } from "@/lib/chat-execution-steps";

export type CanvasLiveStreamEvent =
  | {
      event: "connected";
      data: { workflow_id: string; mode: string };
    }
  | {
      event: "workflow.run.started";
      data: { run_id: string; workflow_id: string; mode: string; compiled_hash: string };
    }
  | {
      event: "workflow.run.node.start";
      data: { run_id: string; node_id: string; node_type: string };
    }
  | {
      event: "workflow.run.node.complete";
      data: {
        run_id: string;
        node_id: string;
        node_type: string;
        status: "ok" | "skipped" | "failed";
        detail?: string;
        duration_ms: number;
        executed?: boolean;
      };
    }
  | {
      event: "workflow.run.node.executed";
      data: { run_id: string; node_id: string; node_type: string; payload: unknown };
    }
  | {
      event: "workflow.run.policy.denied";
      data: { run_id: string; code: string; message: string };
    }
  | {
      event: "workflow.run.killed";
      data: { run_id: string; message: string };
    }
  | {
      event: "workflow.run.complete";
      data: {
        run_id: string;
        status: "completed" | "failed" | "cancelled";
        summary: string;
        warnings: string[];
        nodes_executed: number;
        executed_actions: number;
        simulated_actions: number;
      };
    }
  | { event: "workflow.run.error"; data: { code: string; message: string; run_id?: string } };

export function liveEventToExecutionStep(
  event: CanvasLiveStreamEvent,
  nodeTitleById: Map<string, string>,
): ExecutionStep | null {
  if (event.event === "workflow.run.node.complete") {
    const title =
      nodeTitleById.get(event.data.node_id) ??
      event.data.node_type.replace(/_/g, " ");
    return {
      id: `live-${event.data.node_id}`,
      label: title,
      detail: event.data.detail,
      status:
        event.data.status === "failed"
          ? "failed"
          : event.data.status === "skipped"
            ? "skipped"
            : event.data.executed
              ? "ok"
              : "ok",
    };
  }

  if (event.event === "workflow.run.node.executed") {
    const payload = event.data.payload as {
      tx_hash?: string;
      explorer_url?: string;
    } | null;
    const title =
      nodeTitleById.get(event.data.node_id) ??
      event.data.node_type.replace(/_/g, " ");
    return {
      id: `live-exec-${event.data.node_id}`,
      label: `${title} executed`,
      detail: payload && "order_id" in payload ? String((payload as { order_id: string }).order_id) : undefined,
      status: "ok",
      digest: payload?.tx_hash,
      chainId: "ethereum",
      evmChainId: 137,
    };
  }

  if (event.event === "workflow.run.policy.denied") {
    return {
      id: `policy-deny-${event.data.run_id}`,
      label: "Policy denied",
      detail: event.data.message,
      status: "failed",
    };
  }

  if (event.event === "workflow.run.killed") {
    return {
      id: `killed-${event.data.run_id}`,
      label: "Kill switch",
      detail: event.data.message,
      status: "failed",
    };
  }

  if (event.event === "workflow.run.complete") {
    return {
      id: `complete-${event.data.run_id}`,
      label: event.data.status === "completed" ? "Live run complete" : "Live run ended",
      detail: event.data.summary,
      status: event.data.status === "completed" ? "ok" : "failed",
    };
  }

  return null;
}
