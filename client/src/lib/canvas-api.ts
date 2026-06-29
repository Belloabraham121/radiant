import { apiFetch, apiUrl } from "@/lib/api";
import type { CanvasLlmModelTier } from "./canvas-types";

export type CanvasBuildConfig = {
  model_tier: CanvasLlmModelTier;
  provider?: "openai";
};

export type CanvasGraphViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type CanvasGraphNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  size?: { w: number; h: number };
  config: Record<string, unknown>;
  preview_state?: string;
  meta?: { label?: string; builder_note?: string };
};

export type CanvasGraphEdge = {
  id: string;
  source: { node_id: string; port: string };
  target: { node_id: string; port: string };
};

export type CanvasGraphPayload = {
  nodes: CanvasGraphNode[];
  edges: CanvasGraphEdge[];
  viewport?: CanvasGraphViewport;
};

export type CanvasWorkflowListItem = {
  id: string;
  name: string;
  status: string;
  revision: number;
  updated_at: string;
};

export type CanvasWorkflowDetail = {
  id: string;
  name: string;
  status: string;
  schema_version: string;
  revision: number;
  graph: CanvasGraphPayload;
  build_config: CanvasBuildConfig | null;
  tester_config: CanvasBuildConfig | null;
  policy_id: string;
  created_at: string;
  updated_at: string;
};

export async function listCanvasWorkflows(): Promise<{ workflows: CanvasWorkflowListItem[] }> {
  return apiFetch<{ workflows: CanvasWorkflowListItem[] }>("/api/v1/canvas/workflows");
}

export async function createCanvasWorkflow(input?: {
  name?: string;
}): Promise<CanvasWorkflowDetail> {
  return apiFetch<CanvasWorkflowDetail>("/api/v1/canvas/workflows", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export async function getCanvasWorkflow(workflowId: string): Promise<CanvasWorkflowDetail> {
  return apiFetch<CanvasWorkflowDetail>(`/api/v1/canvas/workflows/${workflowId}`);
}

export async function patchCanvasWorkflowBuildConfig(
  workflowId: string,
  buildConfig: CanvasBuildConfig,
): Promise<CanvasWorkflowDetail> {
  return apiFetch<CanvasWorkflowDetail>(
    `/api/v1/canvas/workflows/${workflowId}/build_config`,
    {
      method: "PATCH",
      body: JSON.stringify(buildConfig),
    },
  );
}

export type CanvasBuildStreamEvent =
  | { event: "connected"; data: { workflow_id: string; model_tier: string; provider: string } }
  | { event: "workflow.node.add"; data: { node: CanvasGraphNode } }
  | { event: "workflow.node.update"; data: { node_id: string; patch: Partial<CanvasGraphNode> } }
  | {
      event: "workflow.node.patch";
      data: { node_id: string; json_patch: Array<Record<string, unknown>> };
    }
  | { event: "workflow.edge.add"; data: { edge: CanvasGraphEdge } }
  | { event: "workflow.edge.remove"; data: { edge_id: string } }
  | { event: "workflow.node.focus"; data: { node_id: string; reason?: string } }
  | {
      event: "workflow.build.complete";
      data: { revision: number; summary: string; warnings: string[] };
    }
  | { event: "workflow.build.error"; data: { code: string; message: string } };

export async function streamCanvasBuild(
  workflowId: string,
  message: string,
  onEvent: (evt: CanvasBuildStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(
    apiUrl(`/api/v1/canvas/workflows/${workflowId}/build/stream`),
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ message }),
      signal,
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Build stream failed (${response.status})`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const lines = chunk.split("\n");
      let eventName = "message";
      let dataLine = "";
      for (const line of lines) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        if (line.startsWith("data:")) dataLine = line.slice(5).trim();
      }
      if (!dataLine) continue;
      const data = JSON.parse(dataLine) as CanvasBuildStreamEvent["data"];
      onEvent({ event: eventName, data } as CanvasBuildStreamEvent);
    }
  }
}
