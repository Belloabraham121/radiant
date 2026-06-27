import { AsyncLocalStorage } from "node:async_hooks";

export type SoroswapExecuteStreamContext = {
  sessionId?: string;
  transactionId?: string;
};

const storage = new AsyncLocalStorage<SoroswapExecuteStreamContext>();

export function runWithSoroswapExecuteContext<T>(
  ctx: SoroswapExecuteStreamContext,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(ctx, fn);
}

export function getSoroswapExecuteContext(): SoroswapExecuteStreamContext | undefined {
  return storage.getStore();
}
