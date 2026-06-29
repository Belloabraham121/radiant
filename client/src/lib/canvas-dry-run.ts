"use client";

import type { ExecutionStep } from "@/lib/chat-execution-steps";

export type CanvasDryRunStreamEvent =
  | {
      event: "connected";
      data: { workflow_id: string; model_tier: string; provider: string; mode: string };
    }
  | { event: "workflow.run.started"; data: { run_id: string; workflow_id: string; mode: string; compiled_hash: string } }
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
        simulated?: boolean;
      };
    }
  | {
      event: "workflow.run.node.simulated";
      data: { run_id: string; node_id: string; node_type: string; payload: unknown };
    }
  | {
      event: "workflow.run.policy.warning";
      data: {
        run_id: string;
        warnings: Array<{ node_id: string; code: string; message: string }>;
      };
    }
  | {
      event: "workflow.run.complete";
      data: {
        run_id: string;
        status: "completed" | "failed";
        summary: string;
        warnings: string[];
        nodes_executed: number;
        simulated_actions: number;
      };
    }
  | { event: "workflow.run.error"; data: { code: string; message: string; run_id?: string } };

export type DryRunNodeBadge = {
  nodeId: string;
  simulated?: boolean;
  status?: "ok" | "skipped" | "failed" | "running";
  detail?: string;
};

export function dryRunEventToExecutionStep(
  event: CanvasDryRunStreamEvent,
  nodeTitleById: Map<string, string>,
): ExecutionStep | null {
  if (event.event === "workflow.run.node.complete") {
    const title =
      nodeTitleById.get(event.data.node_id) ??
      event.data.node_type.replace(/_/g, " ");
    return {
      id: `dry-${event.data.node_id}`,
      label: title,
      detail: event.data.detail,
      status:
        event.data.status === "failed"
          ? "failed"
          : event.data.status === "skipped"
            ? "skipped"
            : event.data.simulated
              ? "warning"
              : "ok",
    };
  }
  if (event.event === "workflow.run.policy.warning") {
    const first = event.data.warnings[0];
    if (!first) return null;
    return {
      id: `policy-${event.data.run_id}`,
      label: "Policy warning",
      detail: first.message,
      status: "warning",
    };
  }
  if (event.event === "workflow.run.complete") {
    return {
      id: `complete-${event.data.run_id}`,
      label: event.data.status === "completed" ? "Dry run complete" : "Dry run failed",
      detail: event.data.summary,
      status: event.data.status === "completed" ? "ok" : "failed",
    };
  }
  return null;
}

export function applyDryRunNodeBadge(
  badges: Map<string, DryRunNodeBadge>,
  event: CanvasDryRunStreamEvent,
): Map<string, DryRunNodeBadge> {
  const next = new Map(badges);
  if (event.event === "workflow.run.node.start") {
    next.set(event.data.node_id, { nodeId: event.data.node_id, status: "running" });
  }
  if (event.event === "workflow.run.node.complete") {
    next.set(event.data.node_id, {
      nodeId: event.data.node_id,
      status: event.data.status,
      simulated: event.data.simulated,
      detail: event.data.detail,
    });
  }
  if (event.event === "workflow.run.node.simulated") {
    const prev = next.get(event.data.node_id);
    next.set(event.data.node_id, {
      ...prev,
      nodeId: event.data.node_id,
      simulated: true,
      status: prev?.status ?? "ok",
    });
  }
  return next;
}
