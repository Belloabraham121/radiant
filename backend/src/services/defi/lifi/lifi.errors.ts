import { HTTPError, SDKError } from "@lifi/sdk";
import { AppError } from "../../../errors/app-error.js";

export const LIFI_ERROR_CODES = [
  "LIFI_RATE_LIMITED",
  "LIFI_NO_ROUTE",
  "LIFI_VALIDATION_ERROR",
  "LIFI_UNAVAILABLE",
] as const;

export type LifiErrorCode = (typeof LIFI_ERROR_CODES)[number];

function sanitizeMessage(message: string): string {
  return message.replace(/x-lifi-api-key[^\s]*/gi, "[redacted]").slice(0, 500);
}

function userFacingLifiMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("could not find token")) {
    return "That token is not available for this bridge route. Check the destination token and network, then try again.";
  }
  if (lower.includes("deny list")) {
    return "That destination token is not available for this bridge route. Try cross_chain_routes to find an alternative, or ask the user to choose a different destination token (e.g. ETH instead of USDC).";
  }
  if (lower.includes("no route") || lower.includes("unavailable routes")) {
    return message;
  }
  return message;
}

function mapHttpStatus(status: number, message: string): AppError {
  const userMessage = userFacingLifiMessage(message);
  if (status === 429) {
    return new AppError(429, "LIFI_RATE_LIMITED", "Li-Fi is rate limiting; retry shortly.", {
      status,
    });
  }
  if (status === 404) {
    return new AppError(404, "LIFI_NO_ROUTE", userMessage || "No route found for this transfer.", {
      status,
    });
  }
  if (status === 400) {
    return new AppError(400, "LIFI_VALIDATION_ERROR", userMessage || "Invalid Li-Fi request.", {
      status,
    });
  }
  if (status >= 500) {
    return new AppError(503, "LIFI_UNAVAILABLE", "Li-Fi is temporarily unavailable.", { status });
  }
  return new AppError(502, "LIFI_UNAVAILABLE", userMessage || "Li-Fi request failed.", { status });
}

/** Map Li-Fi SDK / REST errors to Radiant AppError codes. */
export function mapLifiError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }

  if (err instanceof SDKError) {
    const cause = err.cause;
    if (cause instanceof HTTPError) {
      const bodyMessage =
        typeof cause.responseBody?.message === "string" ? cause.responseBody.message : cause.message;
      return mapHttpStatus(cause.status, sanitizeMessage(bodyMessage));
    }
    const message = sanitizeMessage(cause.message);
    if (/no route|unavailable routes|could not find/i.test(message)) {
      return new AppError(404, "LIFI_NO_ROUTE", userFacingLifiMessage(message));
    }
    if (/validation|invalid/i.test(message)) {
      return new AppError(400, "LIFI_VALIDATION_ERROR", userFacingLifiMessage(message));
    }
    return new AppError(503, "LIFI_UNAVAILABLE", message);
  }

  if (err instanceof HTTPError) {
    const bodyMessage =
      typeof err.responseBody?.message === "string" ? err.responseBody.message : err.message;
    return mapHttpStatus(err.status, sanitizeMessage(bodyMessage));
  }

  if (typeof err === "object" && err !== null && "status" in err && "message" in err) {
    const record = err as { status: number; message: string };
    return mapHttpStatus(record.status, sanitizeMessage(record.message));
  }

  if (err instanceof Error) {
    const message = sanitizeMessage(err.message);
    if (/abort|timeout|ETIMEDOUT|ECONNRESET/i.test(message)) {
      return new AppError(503, "LIFI_UNAVAILABLE", "Li-Fi request timed out.");
    }
    if (/no route|unavailable routes/i.test(message)) {
      return new AppError(404, "LIFI_NO_ROUTE", message);
    }
    return new AppError(502, "LIFI_UNAVAILABLE", message);
  }

  return new AppError(503, "LIFI_UNAVAILABLE", "Li-Fi request failed.");
}
