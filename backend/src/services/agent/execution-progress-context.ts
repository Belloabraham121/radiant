import { AsyncLocalStorage } from "node:async_hooks";
import type { ArtifactPayload } from "../projects/project.types.js";
import type { ExecutionProgressEvent } from "./execution-progress.types.js";

type ProgressStore = {
  onProgress: (event: ExecutionProgressEvent) => void;
  onArtifact?: (data: { artifact: ArtifactPayload; streaming: boolean }) => void;
};

const storage = new AsyncLocalStorage<ProgressStore>();

export type ExecutionProgressCallbacks = {
  onProgress: (event: ExecutionProgressEvent) => void;
  onArtifact?: (data: { artifact: ArtifactPayload; streaming: boolean }) => void;
};

export function runWithExecutionProgress<T>(
  callbacks: ExecutionProgressCallbacks,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(
    {
      onProgress: callbacks.onProgress,
      onArtifact: callbacks.onArtifact,
    },
    fn,
  );
}

export function emitExecutionProgress(event: ExecutionProgressEvent): void {
  storage.getStore()?.onProgress(event);
}

export function emitArtifactPreview(artifact: ArtifactPayload, streaming = true): void {
  storage.getStore()?.onArtifact?.({ artifact, streaming });
}

export function hasExecutionProgressContext(): boolean {
  return storage.getStore() != null;
}
