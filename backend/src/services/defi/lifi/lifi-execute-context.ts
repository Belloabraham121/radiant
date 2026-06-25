import { AsyncLocalStorage } from "node:async_hooks";

export type LifiExecuteStreamContext = {
  sessionId?: string;
  transactionId?: string;
};

const storage = new AsyncLocalStorage<LifiExecuteStreamContext>();

export function runWithLifiExecuteContext<T>(
  ctx: LifiExecuteStreamContext,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(ctx, fn);
}

export function getLifiExecuteContext(): LifiExecuteStreamContext | undefined {
  return storage.getStore();
}
