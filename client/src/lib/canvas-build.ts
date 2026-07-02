"use client";

import type { CanvasBuildStreamEvent } from "@/lib/canvas-api";

export type BuilderActivityKind =
  | "thinking"
  | "status"
  | "tool"
  | "warning"
  | "error"
  | "success"
  | "node"
  | "edge"
  | "complete"
  | "ack";

export type BuilderActivityEntry = {
  id: string;
  kind: BuilderActivityKind;
  message: string;
  tool?: string;
  timestamp: number;
};

let entryCounter = 0;

function nextEntryId(): string {
  entryCounter += 1;
  return `build-${entryCounter}-${Date.now()}`;
}

export function createBuilderActivityEntry(
  kind: BuilderActivityKind,
  message: string,
  tool?: string,
): BuilderActivityEntry {
  return {
    id: nextEntryId(),
    kind,
    message,
    tool,
    timestamp: Date.now(),
  };
}

function formatUserBuildMessage(content: string): string {
  const trimmed = content.trim();
  const preview = trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed;
  return `You: ${preview}`;
}

/** Map persisted build thread rows to activity panel entries. */
export function buildMessagesToActivityEntries(
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    created_at: string;
  }>,
): BuilderActivityEntry[] {
  return messages.map((message) => {
    if (message.role === "user") {
      return {
        id: `history-${message.id}`,
        kind: "status",
        message: formatUserBuildMessage(message.content),
        timestamp: Date.parse(message.created_at) || 0,
      };
    }
    return {
      id: `history-${message.id}`,
      kind: "complete",
      message: message.content,
      timestamp: Date.parse(message.created_at) || 0,
    };
  });
}

export function buildStreamEventToActivity(
  event: CanvasBuildStreamEvent,
): BuilderActivityEntry | BuilderActivityEntry[] | null {
  switch (event.event) {
    case "connected":
      return createBuilderActivityEntry(
        "status",
        `Connected — ${event.data.provider} · ${event.data.model_tier}`,
      );
    case "workflow.build.started":
      return createBuilderActivityEntry("status", event.data.message);
    case "workflow.build.status":
      return createBuilderActivityEntry(event.data.kind, event.data.message, event.data.tool);
    case "workflow.build.ack":
      return createBuilderActivityEntry("ack", event.data.message);
    case "workflow.node.add": {
      const label =
        event.data.node.meta?.label ??
        event.data.node.type.replace(/_/g, " ");
      return createBuilderActivityEntry("node", `Added ${label} node`);
    }
    case "workflow.node.update":
      return createBuilderActivityEntry("node", `Updated node ${event.data.node_id.slice(0, 8)}…`);
    case "workflow.node.patch":
      return createBuilderActivityEntry("node", `Patched node ${event.data.node_id.slice(0, 8)}…`);
    case "workflow.edge.add":
      return createBuilderActivityEntry("edge", "Connected two nodes");
    case "workflow.edge.remove":
      return createBuilderActivityEntry("edge", "Removed a connection");
    case "workflow.node.focus":
      return createBuilderActivityEntry(
        "status",
        `Focusing node for configuration`,
      );
    case "workflow.build.complete": {
      const entries: BuilderActivityEntry[] = [
        createBuilderActivityEntry("complete", event.data.summary),
      ];
      for (const warning of event.data.warnings) {
        entries.push(createBuilderActivityEntry("warning", warning));
      }
      return entries;
    }
    case "workflow.build.error":
      return createBuilderActivityEntry("error", event.data.message);
    default:
      return null;
  }
}
