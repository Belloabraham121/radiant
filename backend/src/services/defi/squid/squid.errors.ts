import { AppError } from "../../../errors/app-error.js";
import { mapAgentToolError } from "../../../utils/agent-tool-errors.js";

export const SQUID_ERROR_CODES = [
  "SQUID_RATE_LIMITED",
  "SQUID_NO_ROUTE",
  "SQUID_VALIDATION_ERROR",
  "SQUID_UNAVAILABLE",
] as const;

export type SquidErrorCode = (typeof SQUID_ERROR_CODES)[number];

function sanitizeMessage(message: string): string {
  return message.replace(/x-integrator-id[^\s]*/gi, "[redacted]").slice(0, 500);
}

function extractAxiosStatus(err: unknown): number | null {
  if (typeof err !== "object" || err === null || !("response" in err)) {
    return null;
  }
  const status = (err as { response?: { status?: number } }).response?.status;
  return typeof status === "number" ? status : null;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return sanitizeMessage(err.message);
  }
  if (typeof err === "object" && err !== null) {
    const record = err as Record<string, unknown>;
    if (typeof record.message === "string") {
      return sanitizeMessage(record.message);
    }
    if (typeof record.error === "string") {
      return sanitizeMessage(record.error);
    }
    if (Array.isArray(record.error)) {
      const first = record.error[0];
      if (first && typeof first === "object" && "message" in first) {
        const message = (first as { message?: string }).message;
        if (typeof message === "string") {
          return sanitizeMessage(message);
        }
      }
    }
  }
  if (typeof err === "string") {
    return sanitizeMessage(err);
  }
  return "";
}

function mapHttpStatus(status: number, message: string): AppError {
  if (status === 429) {
    return new AppError(429, "SQUID_RATE_LIMITED", "Squid is rate limiting; retry shortly.", {
      status,
    });
  }
  if (status === 404) {
    return new AppError(404, "SQUID_NO_ROUTE", message || "No route found for this transfer.", {
      status,
    });
  }
  if (status === 400) {
    return new AppError(400, "SQUID_VALIDATION_ERROR", message || "Invalid Squid request.", {
      status,
    });
  }
  if (status >= 500) {
    return new AppError(503, "SQUID_UNAVAILABLE", "Squid is temporarily unavailable.", { status });
  }
  return new AppError(502, "SQUID_UNAVAILABLE", message || "Squid request failed.", { status });
}

/** Map Squid SDK / HTTP errors to Radiant AppError codes. */
export function mapSquidError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }

  const axiosStatus = extractAxiosStatus(err);
  const message = extractErrorMessage(err);

  if (axiosStatus !== null) {
    return mapHttpStatus(axiosStatus, message);
  }

  if (typeof err === "object" && err !== null && "status" in err && "message" in err) {
    const record = err as { status: number; message: string };
    return mapHttpStatus(record.status, sanitizeMessage(record.message));
  }

  const lower = message.toLowerCase();
  if (/no route|route not found|empty estimate|could not find/i.test(lower)) {
    return new AppError(404, "SQUID_NO_ROUTE", message || "No route found for this transfer.");
  }
  if (/validation|invalid|required/i.test(lower)) {
    return new AppError(400, "SQUID_VALIDATION_ERROR", message || "Invalid Squid request.");
  }
  if (/rate limit|too many requests/i.test(lower)) {
    return new AppError(429, "SQUID_RATE_LIMITED", "Squid is rate limiting; retry shortly.");
  }
  if (/abort|timeout|ETIMEDOUT|ECONNRESET|network/i.test(lower)) {
    return new AppError(503, "SQUID_UNAVAILABLE", "Squid request timed out.");
  }
  if (message) {
    return new AppError(502, "SQUID_UNAVAILABLE", message);
  }

  return new AppError(503, "SQUID_UNAVAILABLE", "Squid request failed.");
}

/** Map Squid execute-time failures; non-Squid errors fall back to generic tool mapping. */
export function mapSquidExecuteError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }
  if (extractAxiosStatus(err) !== null || extractErrorMessage(err)) {
    return mapSquidError(err);
  }
  return mapAgentToolError(err);
}
