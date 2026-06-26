import { AppError } from "../../../errors/app-error.js";
import { extractLifiErrorMessage } from "../lifi/lifi.errors.js";

const NO_ROUTE_MESSAGE_RE = /no route|unavailable routes|could not find/i;

const INELIGIBLE_APP_ERROR_CODES = new Set([
  "LIFI_RATE_LIMITED",
  "LIFI_VALIDATION_ERROR",
  "LIFI_UNAVAILABLE",
  "AMOUNT_REQUIRED",
  "INSUFFICIENT_BALANCE",
  "SLIPPAGE_EXCEEDED",
  "TRANSACTION_FAILED",
  "WALLET_NOT_FOUND",
  "CHAIN_DISABLED",
  "SQUID_UNAVAILABLE",
]);

function messageIndicatesNoRoute(err: unknown): boolean {
  const message = extractLifiErrorMessage(err);
  return NO_ROUTE_MESSAGE_RE.test(message);
}

/** True only when Li-Fi had no liquidity — not rate limits, auth, validation, or wallet errors. */
export function isLiquidityFallbackEligible(err: unknown, routes?: unknown[]): boolean {
  if (routes && routes.length > 0) {
    return false;
  }

  if (err == null) {
    return true;
  }

  if (err instanceof AppError) {
    if (err.code === "LIFI_NO_ROUTE") {
      return true;
    }
    if (INELIGIBLE_APP_ERROR_CODES.has(err.code)) {
      return false;
    }
    return messageIndicatesNoRoute(err);
  }

  return messageIndicatesNoRoute(err);
}
