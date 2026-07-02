import { AsyncLocalStorage } from "node:async_hooks";
import type {
  CanvasBuildProgressEvent,
  CanvasBuildStreamSender,
  JsonPatchOperation,
  WorkflowBuildStatusKind,
} from "./canvas-build-progress.types.js";
import type { CanvasEdge, CanvasNode } from "../graph/canvas-graph.types.js";
import type {
  CanvasAgentLlmConfig,
  CanvasLlmModelTier,
  CanvasLlmProviderId,
} from "../llm/canvas-llm.types.js";

type CanvasBuildProgressStore = {
  send?: CanvasBuildStreamSender;
  model_tier?: CanvasLlmModelTier;
  provider?: CanvasLlmProviderId;
  build_config?: CanvasAgentLlmConfig;
};

const storage = new AsyncLocalStorage<CanvasBuildProgressStore>();

export type CanvasBuildProgressContextOptions = {
  send: CanvasBuildStreamSender;
  build_config?: CanvasAgentLlmConfig;
};

export function runWithCanvasBuildProgress<T>(
  options: CanvasBuildProgressContextOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const { send, build_config } = options;
  return storage.run(
    {
      send,
      build_config,
      model_tier: build_config?.model_tier,
      provider: build_config?.provider ?? "openai",
    },
    fn,
  );
}

export function getCanvasBuildLlmConfig(): CanvasAgentLlmConfig {
  const store = storage.getStore();
  return {
    model_tier: store?.model_tier ?? "lite",
    provider: store?.provider ?? "openai",
  };
}

export function hasCanvasBuildProgressContext(): boolean {
  return storage.getStore()?.send != null;
}

function emit(event: CanvasBuildProgressEvent): void {
  const send = storage.getStore()?.send;
  if (!send) {
    return;
  }
  const { type, ...payload } = event;
  send(type, payload);
}

export function emitWorkflowBuildStarted(message: string): void {
  emit({ type: "workflow.build.started", message });
}

export function emitWorkflowBuildStatus(
  message: string,
  kind: WorkflowBuildStatusKind = "status",
  tool?: string,
): void {
  emit({ type: "workflow.build.status", message, kind, tool });
}

export function emitWorkflowBuildAck(message: string): void {
  emit({ type: "workflow.build.ack", message });
}

export function emitWorkflowNodeAdd(node: CanvasNode): void {
  emit({ type: "workflow.node.add", node });
}

export function emitWorkflowNodeUpdate(
  node_id: string,
  patch: Partial<CanvasNode>,
): void {
  emit({ type: "workflow.node.update", node_id, patch });
}

export function emitWorkflowNodePatch(
  node_id: string,
  json_patch: JsonPatchOperation[],
): void {
  emit({ type: "workflow.node.patch", node_id, json_patch });
}

export function emitWorkflowEdgeAdd(edge: CanvasEdge): void {
  emit({ type: "workflow.edge.add", edge });
}

export function emitWorkflowEdgeRemove(edge_id: string): void {
  emit({ type: "workflow.edge.remove", edge_id });
}

export function emitWorkflowNodeFocus(node_id: string, reason?: string): void {
  emit({ type: "workflow.node.focus", node_id, reason });
}

export function emitWorkflowBuildComplete(
  revision: number,
  summary: string,
  warnings: string[] = [],
): void {
  emit({ type: "workflow.build.complete", revision, summary, warnings });
}

export function emitWorkflowApprovePending(
  node_id: string,
  run_id: string,
  payload_preview: unknown,
): void {
  emit({ type: "workflow.approve.pending", node_id, run_id, payload_preview });
}

export function emitWorkflowBuildError(code: string, message: string): void {
  emit({ type: "workflow.build.error", code, message });
}
