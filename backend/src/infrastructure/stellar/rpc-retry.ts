import { AppError } from "../../errors/app-error.js";
import {
  isStellarRpcUnavailableError,
  stellarRpcUnavailableAppError,
} from "../../config/stellar.js";

const RATE_LIMIT_PATTERN = /too many requests|rate limit|429/i;

export function isStellarRpcRateLimitError(err: unknown): boolean {
  if (err instanceof AppError && err.code === "STELLAR_RPC_RATE_LIMITED") {
    return true;
  }
  const message = err instanceof Error ? err.message : String(err);
  return RATE_LIMIT_PATTERN.test(message);
}

export function stellarRpcRateLimitAppError(cause: unknown): AppError {
  const message = cause instanceof Error ? cause.message : String(cause);
  return new AppError(
    503,
    "STELLAR_RPC_RATE_LIMITED",
    "Stellar RPC is rate limiting requests right now. Wait a few seconds and try again. " +
      "If this keeps happening, set dedicated HORIZON_URL / SOROBAN_RPC_URL in your backend environment.",
    { cause: message },
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry transient Stellar RPC 429 / rate-limit responses with short backoff. */
export async function withStellarRpcRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (err instanceof AppError && err.code !== "STELLAR_RPC_RATE_LIMITED") {
        throw err;
      }
      if (!isStellarRpcRateLimitError(err) || attempt >= maxAttempts - 1) {
        if (isStellarRpcRateLimitError(err)) {
          throw stellarRpcRateLimitAppError(err);
        }
        if (isStellarRpcUnavailableError(err)) {
          throw stellarRpcUnavailableAppError(err);
        }
        throw err;
      }
      await sleep(400 * (attempt + 1));
    }
  }
  throw last;
}
