import { AsyncLocalStorage } from "node:async_hooks";
import type { ExecutionProgressEvent } from "./execution-progress.types.js";

type ProgressStore = {
  onProgress: (event: ExecutionProgressEvent) => void;
};

const storage = new AsyncLocalStorage<ProgressStore>();

export function runWithExecutionProgress<T>(
  onProgress: (event: ExecutionProgressEvent) => void,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run({ onProgress }, fn);
}

export function emitExecutionProgress(event: ExecutionProgressEvent): void {
  storage.getStore()?.onProgress(event);
}
