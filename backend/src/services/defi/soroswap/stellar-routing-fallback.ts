import { AppError } from "../../../errors/app-error.js";
import { extractSoroswapErrorMessage } from "./soroswap.errors.js";

const INELIGIBLE_APP_ERROR_CODES = new Set([
  "SOROSWAP_RATE_LIMITED",
  "SOROSWAP_UNAUTHORIZED",
  "SOROSWAP_VALIDATION_ERROR",
  "INSUFFICIENT_BALANCE",
  "SLIPPAGE_EXCEEDED",
  "TRANSACTION_FAILED",
  "WALLET_NOT_FOUND",
  "CHAIN_DISABLED",
  "STELLAR_SIGNING_FAILED",
  "SIGNING_FAILED",
  "VALIDATION_ERROR",
]);

/** True when wrong-chain / cross-ecosystem mismatch may offer Stellar routing fallback. */
export function isStellarRoutingFallbackEligible(err: unknown): boolean {
  if (err instanceof AppError) {
    if (err.code === "CROSS_ECOSYSTEM_NOT_SUPPORTED") {
      return true;
    }
    if (INELIGIBLE_APP_ERROR_CODES.has(err.code)) {
      return false;
    }
    return false;
  }

  const message = extractSoroswapErrorMessage(err);
  return /cross[- ]ecosystem|not supported for this pair/i.test(message);
}
