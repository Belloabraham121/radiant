import { AsyncLocalStorage } from "node:async_hooks";
import type { ArtifactPayload } from "../projects/project.types.js";
import {
  enrichExecutionStep,
  type AgentStatusCategory,
} from "./agent-status-category.js";
import type { AgentStatusEvent, ExecutionProgressEvent } from "./execution-progress.types.js";

type ProgressStore = {
  onProgress: (event: ExecutionProgressEvent) => void;
  onStatus?: (event: AgentStatusEvent) => void;
  onArtifact?: (data: { artifact: ArtifactPayload; streaming: boolean }) => void;
  onReplyDelta?: (delta: string) => void;
  onReplyClear?: () => void;
  lastStatusCategory?: AgentStatusCategory;
};

const storage = new AsyncLocalStorage<ProgressStore>();

export type ExecutionProgressCallbacks = {
  onProgress: (event: ExecutionProgressEvent) => void;
  onStatus?: (event: AgentStatusEvent) => void;
  onArtifact?: (data: { artifact: ArtifactPayload; streaming: boolean }) => void;
  onReplyDelta?: (delta: string) => void;
  onReplyClear?: () => void;
};

export function runWithExecutionProgress<T>(
  callbacks: ExecutionProgressCallbacks,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(
    {
      onProgress: callbacks.onProgress,
      onStatus: callbacks.onStatus,
      onArtifact: callbacks.onArtifact,
      onReplyDelta: callbacks.onReplyDelta,
      onReplyClear: callbacks.onReplyClear,
    },
    fn,
  );
}

export function emitAgentStatusCategory(category: AgentStatusCategory): void {
  const store = storage.getStore();
  if (!store?.onStatus) {
    return;
  }
  if (store.lastStatusCategory === category) {
    return;
  }
  store.lastStatusCategory = category;
  store.onStatus({ category });
}

export function emitExecutionProgress(event: ExecutionProgressEvent): void {
  const store = storage.getStore();
  if (!store) {
    return;
  }

  const step = enrichExecutionStep(event.step);
  store.onProgress({ step });
  if (step.status_category) {
    emitAgentStatusCategory(step.status_category);
  }
}

export function emitArtifactPreview(artifact: ArtifactPayload, streaming = true): void {
  storage.getStore()?.onArtifact?.({ artifact, streaming });
}

export function emitReplyDelta(delta: string): void {
  if (!delta) return;
  storage.getStore()?.onReplyDelta?.(delta);
}

export function emitReplyClear(): void {
  storage.getStore()?.onReplyClear?.();
}

export function hasExecutionProgressContext(): boolean {
  return storage.getStore() != null;
}
