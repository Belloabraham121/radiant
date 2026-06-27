import { AppError } from "../../../errors/app-error.js";
import {
  mapStellarSimulationError,
  mapStellarSubmitError,
} from "../../../infrastructure/stellar/errors.js";
import { mapAgentToolError } from "../../../utils/agent-tool-errors.js";
import type { rpc } from "@stellar/stellar-sdk";

export const SOROSWAP_ERROR_CODES = [
  "SOROSWAP_ROUTE_NOT_FOUND",
  "SOROSWAP_VALIDATION_ERROR",
  "SOROSWAP_UNAUTHORIZED",
  "SOROSWAP_RATE_LIMITED",
  "SOROSWAP_UNAVAILABLE",
  "SOROSWAP_QUOTE_EXPIRED",
] as const;

export type SoroswapErrorCode = (typeof SOROSWAP_ERROR_CODES)[number];

const API_KEY_RE = /sk_[a-zA-Z0-9_-]+/g;
const AUTH_HEADER_RE = /Authorization[^\s]*/gi;
const BEARER_RE = /Bearer\s+[^\s]+/gi;

export function sanitizeMessage(message: string): string {
  return message
    .replace(AUTH_HEADER_RE, "[redacted]")
    .replace(BEARER_RE, "[redacted]")
    .replace(API_KEY_RE, "[redacted]")
    .slice(0, 500);
}

function extractFromResponseData(data: unknown): string {
  if (typeof data === "string") {
    return sanitizeMessage(data);
  }
  if (typeof data !== "object" || data === null) {
    return "";
  }
  const record = data as Record<string, unknown>;
  if (typeof record.message === "string") {
    return sanitizeMessage(record.message);
  }
  if (typeof record.error === "string") {
    return sanitizeMessage(record.error);
  }
  return "";
}

function extractHttpStatus(err: unknown): number | null {
  if (typeof err !== "object" || err === null) {
    return null;
  }
  if ("response" in err) {
    const status = (err as { response?: { status?: number } }).response?.status;
    if (typeof status === "number") {
      return status;
    }
  }
  if ("status" in err) {
    const status = (err as { status?: number }).status;
    if (typeof status === "number") {
      return status;
    }
  }
  if ("statusCode" in err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (typeof statusCode === "number") {
      return statusCode;
    }
  }
  return null;
}

/** Walk Soroswap HTTP / SDK-shaped error bodies for a human-readable message. */
export function extractSoroswapErrorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null && "response" in err) {
    const data = (err as { response?: { data?: unknown } }).response?.data;
    if (data !== undefined) {
      const fromData = extractFromResponseData(data);
      if (fromData) {
        return fromData;
      }
    }
  }
  if (err instanceof Error) {
    return sanitizeMessage(err.message);
  }
  if (typeof err === "object" && err !== null) {
    const record = err as Record<string, unknown>;
    if (typeof record.message === "string") {
      return sanitizeMessage(record.message);
    }
  }
  if (typeof err === "string") {
    return sanitizeMessage(err);
  }
  return "";
}

function isNoRouteMessage(message: string): boolean {
  return /no route|route not found|no path|empty route|cannot route/i.test(message);
}

function isInsufficientLiquidityMessage(message: string): boolean {
  return /insufficient liquidity|not enough liquidity|reduce.*amount|price impact|amount exceeds/i.test(
    message,
  );
}

function isInvalidTokenMessage(message: string): boolean {
  return /invalid token|unknown asset|asset not found|not supported/i.test(message);
}

function isValidationMessage(message: string): boolean {
  return /validation|invalid|required|must be/i.test(message);
}

function isUnauthorizedMessage(message: string): boolean {
  return /unauthorized|forbidden|invalid api key|api key/i.test(message);
}

function isRateLimitMessage(message: string): boolean {
  return /rate limit|too many requests/i.test(message);
}

function isExpiredQuoteMessage(message: string): boolean {
  return /expired|stale|quote.*invalid|quote not found/i.test(message);
}

function isNetworkMessage(message: string): boolean {
  return /abort|timeout|ETIMEDOUT|ECONNRESET|network|fetch failed/i.test(message);
}

function mapHttpStatus(status: number, message: string): AppError {
  if (status === 401 || status === 403 || isUnauthorizedMessage(message)) {
    return new AppError(
      status === 403 ? 403 : 401,
      "SOROSWAP_UNAUTHORIZED",
      "Stellar swap service is misconfigured.",
      { status },
    );
  }

  if (status === 429 || isRateLimitMessage(message)) {
    return new AppError(
      429,
      "SOROSWAP_RATE_LIMITED",
      "Stellar quotes are temporarily rate limited; try again shortly.",
      { status },
    );
  }

  if (isExpiredQuoteMessage(message)) {
    return new AppError(
      400,
      "SOROSWAP_QUOTE_EXPIRED",
      "This quote expired. Getting a fresh quote…",
      { status },
    );
  }

  if (
    status === 404 ||
    isNoRouteMessage(message) ||
    isInsufficientLiquidityMessage(message) ||
    (isInvalidTokenMessage(message) && /not in catalog|asset not found/i.test(message))
  ) {
    return new AppError(
      404,
      "SOROSWAP_ROUTE_NOT_FOUND",
      "No swap route on Stellar right now. Try a different amount, slippage, or token pair.",
      { status, cause: message || undefined },
    );
  }

  if (status === 400 || status === 422) {
    if (isInvalidTokenMessage(message) || isValidationMessage(message)) {
      return new AppError(
        400,
        "SOROSWAP_VALIDATION_ERROR",
        message || "Invalid swap request on Stellar.",
        { status },
      );
    }
  }

  if (status >= 500) {
    return new AppError(
      503,
      "SOROSWAP_UNAVAILABLE",
      "Stellar swap service is temporarily unavailable.",
      { status, cause: message || undefined },
    );
  }

  if (status === 400 || status === 422) {
    return new AppError(
      400,
      "SOROSWAP_VALIDATION_ERROR",
      message || "Invalid swap request on Stellar.",
      { status },
    );
  }

  return new AppError(
    502,
    "SOROSWAP_UNAVAILABLE",
    message || "Stellar swap service is temporarily unavailable.",
    { status },
  );
}

/** Map Soroswap HTTP errors (quote, catalog, health) to Radiant AppError codes. */
export function mapSoroswapError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }

  const httpStatus = extractHttpStatus(err);
  const message = extractSoroswapErrorMessage(err);

  if (httpStatus !== null) {
    return mapHttpStatus(httpStatus, message);
  }

  if (typeof err === "object" && err !== null && "status" in err && "message" in err) {
    const record = err as { status: number; message: string };
    return mapHttpStatus(record.status, sanitizeMessage(record.message));
  }

  if (isNoRouteMessage(message) || isInsufficientLiquidityMessage(message)) {
    return new AppError(
      404,
      "SOROSWAP_ROUTE_NOT_FOUND",
      "No swap route on Stellar right now. Try a different amount, slippage, or token pair.",
      { cause: message || undefined },
    );
  }

  if (isExpiredQuoteMessage(message)) {
    return new AppError(400, "SOROSWAP_QUOTE_EXPIRED", "This quote expired. Getting a fresh quote…");
  }

  if (isUnauthorizedMessage(message)) {
    return new AppError(401, "SOROSWAP_UNAUTHORIZED", "Stellar swap service is misconfigured.");
  }

  if (isRateLimitMessage(message)) {
    return new AppError(
      429,
      "SOROSWAP_RATE_LIMITED",
      "Stellar quotes are temporarily rate limited; try again shortly.",
    );
  }

  if (isValidationMessage(message) || isInvalidTokenMessage(message)) {
    return new AppError(
      400,
      "SOROSWAP_VALIDATION_ERROR",
      message || "Invalid swap request on Stellar.",
    );
  }

  if (isNetworkMessage(message)) {
    return new AppError(
      503,
      "SOROSWAP_UNAVAILABLE",
      "Stellar swap service is temporarily unavailable.",
    );
  }

  if (message) {
    return new AppError(503, "SOROSWAP_UNAVAILABLE", message);
  }

  return new AppError(
    503,
    "SOROSWAP_UNAVAILABLE",
    "Stellar swap service is temporarily unavailable.",
  );
}

function isStellarSubmitResponse(err: unknown): err is rpc.Api.SendTransactionResponse {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status?: unknown }).status === "string"
  );
}

function isSoroswapHttpError(err: unknown): boolean {
  if (extractHttpStatus(err) !== null) {
    return true;
  }
  if (typeof err === "object" && err !== null && "response" in err) {
    return true;
  }
  if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    "message" in err &&
    typeof (err as { status?: unknown }).status === "number"
  ) {
    return true;
  }
  return false;
}

/** Map Soroswap execute-time failures; delegate Stellar RPC errors when not Soroswap HTTP. */
export function mapSoroswapExecuteError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }

  if (isStellarSubmitResponse(err)) {
    return mapStellarSubmitError(err);
  }

  const message = extractSoroswapErrorMessage(err);

  if (/slippage/i.test(message)) {
    return new AppError(
      400,
      "SLIPPAGE_EXCEEDED",
      "Price moved too much for this swap. Try again with a fresh quote.",
      { cause: message || undefined },
    );
  }

  if (
    /op_no_trust|trustline|op_no_account|underfunded|insufficient|tx_failed|simulation/i.test(
      message,
    )
  ) {
    const stellarMapped = mapStellarSimulationError(err);
    if (/op_no_account|no account/i.test(message)) {
      return new AppError(
        400,
        "INSUFFICIENT_BALANCE",
        "Fund your Stellar wallet with XLM first (minimum reserve applies).",
        { cause: message || undefined },
      );
    }
    return stellarMapped;
  }

  if (isSoroswapHttpError(err)) {
    return mapSoroswapError(err);
  }

  return mapAgentToolError(err);
}
