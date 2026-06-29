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

export type CanvasPolicyDetail = {
  policy_version: string;
  workflow_id: string;
  max_spend_usd_24h: number;
  max_single_action_usd: number;
  allowed_actions: string[];
  forbidden_transfers: Array<{
    from_chain?: string;
    to_chain?: string;
    token_symbol?: string;
  }>;
  region_profile: string;
  kill_switch: boolean;
  require_deploy_approval: boolean;
  kill_switch_active: boolean;
  spend_usd_24h: number;
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

export async function patchCanvasWorkflowGraph(
  workflowId: string,
  graph: CanvasGraphPayload,
): Promise<CanvasWorkflowDetail> {
  return apiFetch<CanvasWorkflowDetail>(`/api/v1/canvas/workflows/${workflowId}`, {
    method: "PATCH",
    body: JSON.stringify({ graph }),
  });
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

export async function patchCanvasWorkflowTesterConfig(
  workflowId: string,
  testerConfig: CanvasBuildConfig,
): Promise<CanvasWorkflowDetail> {
  return apiFetch<CanvasWorkflowDetail>(
    `/api/v1/canvas/workflows/${workflowId}/tester_config`,
    {
      method: "PATCH",
      body: JSON.stringify(testerConfig),
    },
  );
}

export type CanvasWorkflowRunListItem = {
  id: string;
  workflow_id: string;
  mode: "dry" | "live";
  status: string;
  workflow_revision: number;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
};

export type CanvasWorkflowRunDetail = CanvasWorkflowRunListItem & {
  events: Array<{
    id: string;
    event_type: string;
    payload: unknown;
    created_at: string;
  }>;
};

export async function listCanvasWorkflowRuns(
  workflowId: string,
): Promise<{ runs: CanvasWorkflowRunListItem[] }> {
  return apiFetch<{ runs: CanvasWorkflowRunListItem[] }>(
    `/api/v1/canvas/workflows/${workflowId}/runs`,
  );
}

export async function getCanvasWorkflowRun(
  workflowId: string,
  runId: string,
): Promise<CanvasWorkflowRunDetail> {
  return apiFetch<CanvasWorkflowRunDetail>(
    `/api/v1/canvas/workflows/${workflowId}/runs/${runId}`,
  );
}

async function consumeSseStream<T extends { event: string; data: unknown }>(
  response: Response,
  onEvent: (evt: T) => void,
): Promise<void> {
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
      const data = JSON.parse(dataLine) as T["data"];
      onEvent({ event: eventName, data } as T);
    }
  }
}

export type CanvasBuildStreamEvent =
  | { event: "connected"; data: { workflow_id: string; model_tier: string; provider: string } }
  | { event: "workflow.build.started"; data: { message: string } }
  | {
      event: "workflow.build.status";
      data: {
        message: string;
        kind: "thinking" | "status" | "tool" | "warning" | "error" | "success";
        tool?: string;
      };
    }
  | { event: "workflow.build.ack"; data: { message: string } }
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
    let message = text || `Build stream failed (${response.status})`;
    if (text) {
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string } };
        if (parsed.error?.message) message = parsed.error.message;
      } catch {
        // use raw text
      }
    }
    throw new Error(message);
  }

  await consumeSseStream(response, onEvent);
}

export type CanvasDryRunStreamEvent = import("@/lib/canvas-dry-run").CanvasDryRunStreamEvent;

export async function streamCanvasDryRun(
  workflowId: string,
  onEvent: (evt: CanvasDryRunStreamEvent) => void,
  options?: { message?: string; signal?: AbortSignal },
): Promise<void> {
  const response = await fetch(
    apiUrl(`/api/v1/canvas/workflows/${workflowId}/dry-run/stream`),
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ message: options?.message }),
      signal: options?.signal,
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Dry run stream failed (${response.status})`);
  }

  await consumeSseStream<CanvasDryRunStreamEvent>(response, onEvent);
}

export async function getCanvasWorkflowPolicy(workflowId: string): Promise<CanvasPolicyDetail> {
  return apiFetch<CanvasPolicyDetail>(`/api/v1/canvas/workflows/${workflowId}/policy`);
}

export async function patchCanvasWorkflowPolicy(
  workflowId: string,
  patch: Partial<
    Pick<
      CanvasPolicyDetail,
      | "max_spend_usd_24h"
      | "max_single_action_usd"
      | "allowed_actions"
      | "forbidden_transfers"
      | "region_profile"
      | "kill_switch"
      | "require_deploy_approval"
    >
  >,
): Promise<CanvasPolicyDetail> {
  return apiFetch<CanvasPolicyDetail>(`/api/v1/canvas/workflows/${workflowId}/policy`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function activateCanvasKillSwitch(workflowId: string): Promise<CanvasPolicyDetail> {
  return apiFetch<CanvasPolicyDetail>(`/api/v1/canvas/workflows/${workflowId}/kill`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function stopCanvasLiveWorkflow(
  workflowId: string,
): Promise<{ stopped: true }> {
  return apiFetch<{ stopped: true }>(`/api/v1/canvas/workflows/${workflowId}/live/stop`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export type CanvasLiveStreamEvent = import("@/lib/canvas-live").CanvasLiveStreamEvent;

export async function streamCanvasLive(
  workflowId: string,
  onEvent: (evt: CanvasLiveStreamEvent) => void,
  options?: { confirmLive?: boolean; signal?: AbortSignal },
): Promise<void> {
  const response = await fetch(
    apiUrl(`/api/v1/canvas/workflows/${workflowId}/live/stream`),
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ confirm_live: options?.confirmLive ?? false }),
      signal: options?.signal,
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Live stream failed (${response.status})`);
  }

  await consumeSseStream<CanvasLiveStreamEvent>(response, onEvent);
}
