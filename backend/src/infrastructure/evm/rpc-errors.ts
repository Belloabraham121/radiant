import { HttpRequestError } from "viem";
import { AppError } from "../../errors/app-error.js";

const RPC_UNAVAILABLE_PATTERN =
  /web server is down|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|fetch failed|socket hang up|502|503|521/i;

/** True when an EVM JSON-RPC call failed due to network / provider outage (not user error). */
export function isEvmRpcUnavailableError(err: unknown): boolean {
  if (err instanceof AppError) {
    return err.code === "EVM_RPC_UNAVAILABLE" || err.code === "EVM_RPC_NOT_CONFIGURED";
  }
  if (err instanceof HttpRequestError) {
    return true;
  }
  const message = err instanceof Error ? err.message : String(err);
  return RPC_UNAVAILABLE_PATTERN.test(message);
}

export function evmRpcUnavailableAppError(chainId: number, cause: unknown): AppError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new AppError(
    503,
    "EVM_RPC_UNAVAILABLE",
    `EVM RPC for chain ${chainId} is unavailable. Set EVM_RPC_URL_${chainId} or EVM_RPC_URL in your backend environment.`,
    { cause: detail },
  );
}
