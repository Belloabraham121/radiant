import { AppError } from "../../errors/app-error.js";

const RATE_LIMIT_PATTERN = /too many requests|rate limit|429/i;

export function isSuiRpcRateLimitError(err: unknown): boolean {
  if (err instanceof AppError && err.code === "SUI_RPC_RATE_LIMITED") {
    return true;
  }
  const message = err instanceof Error ? err.message : String(err);
  return RATE_LIMIT_PATTERN.test(message);
}

export function suiRpcRateLimitAppError(cause: unknown): AppError {
  const message = cause instanceof Error ? cause.message : String(cause);
  return new AppError(
    503,
    "SUI_RPC_RATE_LIMITED",
    "Sui RPC is rate limiting requests right now. Wait a few seconds and try again. " +
      "If this keeps happening, set a dedicated SUI_RPC_URL in your backend environment.",
    { cause: message },
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry transient Sui RPC 429 / rate-limit responses with short backoff. */
export async function withSuiRpcRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (err instanceof AppError && err.code !== "SUI_RPC_RATE_LIMITED") {
        throw err;
      }
      if (!isSuiRpcRateLimitError(err) || attempt >= maxAttempts - 1) {
        if (isSuiRpcRateLimitError(err)) {
          throw suiRpcRateLimitAppError(err);
        }
        throw err;
      }
      await sleep(400 * (attempt + 1));
    }
  }
  throw last;
}
