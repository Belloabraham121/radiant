import { HTTPError, LiFiErrorCode, SDKError, TransactionError } from "@lifi/sdk";
import { AppError } from "../../../errors/app-error.js";
import { mapAgentToolError } from "../../../utils/agent-tool-errors.js";

export const LIFI_ERROR_CODES = [
  "LIFI_RATE_LIMITED",
  "LIFI_NO_ROUTE",
  "LIFI_VALIDATION_ERROR",
  "LIFI_UNAVAILABLE",
] as const;

export type LifiErrorCode = (typeof LIFI_ERROR_CODES)[number];

const LIFI_SDK_VERSION_SUFFIX_RE = /\n?LI\.FI SDK version: [\d.]+$/i;
const LIFI_ERROR_PREFIX_RE = /^\[(?:TransactionError|SDKError|RPCError|ProviderError)\]\s*/i;

function sanitizeMessage(message: string): string {
  return stripLifiSdkNoise(message).replace(/x-lifi-api-key[^\s]*/gi, "[redacted]").slice(0, 500);
}

function stripLifiSdkNoise(message: string): string {
  return message.replace(LIFI_SDK_VERSION_SUFFIX_RE, "").replace(LIFI_ERROR_PREFIX_RE, "").trim();
}

function formatUnknownObject(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Error) {
    return value.message.trim() || value.name || null;
  }
  if (typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const candidates = [record.message, record.error, record.reason, record.details, record.abortError];
  for (const candidate of candidates) {
    const formatted = formatUnknownObject(candidate);
    if (formatted) {
      return formatted;
    }
  }

  try {
    const json = JSON.stringify(value);
    if (json && json !== "{}" && json !== "[]") {
      return json.slice(0, 300);
    }
  } catch {
    // ignore
  }

  return null;
}

/** Walk SDK / provider cause chains and recover a human-readable message. */
export function extractLifiErrorMessage(err: unknown, depth = 0): string {
  if (depth > 8 || err == null) {
    return "";
  }

  if (typeof err === "string") {
    return stripLifiSdkNoise(err);
  }

  if (err instanceof SDKError) {
    const fromCause = extractLifiErrorMessage(err.cause, depth + 1);
    if (fromCause) {
      return fromCause;
    }
    return stripLifiSdkNoise(err.message);
  }

  if (err instanceof Error) {
    let message = stripLifiSdkNoise(err.message);

    if (/\[object Object\]/.test(message) && err.cause) {
      const nested = extractLifiErrorMessage(err.cause, depth + 1);
      if (nested) {
        message = message.replace("[object Object]", nested);
      }
    }

    if (!message || message === "[object Object]" || /\[object Object\]/.test(message)) {
      const nested = err.cause ? extractLifiErrorMessage(err.cause, depth + 1) : null;
      if (nested) {
        return nested;
      }
    }

    const embedded = message.match(/Transaction failed:\s*(\[object Object\])/i);
    if (embedded && err.cause) {
      const nested = extractLifiErrorMessage(err.cause, depth + 1);
      if (nested) {
        return `Transaction failed: ${nested}`;
      }
    }

    if (!message || message === "[object Object]") {
      const fromObject = formatUnknownObject(err);
      if (fromObject) {
        return fromObject;
      }
    }

    return message;
  }

  return formatUnknownObject(err) ?? "";
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

function userFacingTransactionMessage(code: number, message: string): string {
  const lower = message.toLowerCase();

  if (
    code === LiFiErrorCode.InsufficientFunds ||
    code === LiFiErrorCode.BalanceError ||
    /insufficient|not enough|exceeds balance/i.test(lower)
  ) {
    return "You do not have enough of the source token or native gas on the source network to complete this bridge.";
  }

  if (code === LiFiErrorCode.SignatureRejected || code === LiFiErrorCode.TransactionRejected) {
    return "The transaction was rejected before it could be submitted.";
  }

  if (
    code === LiFiErrorCode.TransactionSimulationFailed ||
    /simulation|simulate/i.test(lower)
  ) {
    return "The bridge transaction could not be simulated. Check your wallet balance and try a smaller amount.";
  }

  if (code === LiFiErrorCode.SlippageError || /slippage/i.test(lower)) {
    return "The bridge could not complete because the price moved too much. Try again with a fresh quote.";
  }

  if (/transaction failed/i.test(lower)) {
    const detail = message.replace(/^transaction failed:\s*/i, "").trim();
    if (detail && detail !== "[object Object]" && !/\[object Object\]/.test(detail)) {
      return `The bridge transaction failed on chain: ${detail}`;
    }
    return "The on-chain bridge transaction failed. Check that your wallet has enough SUI for gas and the swap amount, then try again.";
  }

  if (!message || message === "[object Object]" || /\[object Object\]/.test(message)) {
    return "The bridge transaction failed on chain. Check your wallet balance and try again.";
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

function mapTransactionError(cause: TransactionError, message: string): AppError {
  const userMessage = userFacingTransactionMessage(cause.code, message);

  if (
    cause.code === LiFiErrorCode.InsufficientFunds ||
    cause.code === LiFiErrorCode.BalanceError ||
    /insufficient|not enough|exceeds balance/i.test(message)
  ) {
    return new AppError(400, "INSUFFICIENT_BALANCE", userMessage, { cause: message });
  }

  if (cause.code === LiFiErrorCode.SlippageError) {
    return new AppError(400, "SLIPPAGE_EXCEEDED", userMessage, { cause: message });
  }

  if (
    cause.code === LiFiErrorCode.SignatureRejected ||
    cause.code === LiFiErrorCode.TransactionRejected ||
    cause.code === LiFiErrorCode.TransactionCanceled
  ) {
    return new AppError(400, "TRANSACTION_FAILED", userMessage, { cause: message });
  }

  return new AppError(400, "TRANSACTION_FAILED", userMessage, { cause: message });
}

export function isRecognizedLifiSdkError(err: unknown): boolean {
  if (err instanceof SDKError || err instanceof HTTPError || err instanceof TransactionError) {
    return true;
  }
  if (err instanceof Error) {
    return (
      LIFI_SDK_VERSION_SUFFIX_RE.test(err.message) ||
      LIFI_ERROR_PREFIX_RE.test(err.message)
    );
  }
  return false;
}

/** Map Li-Fi execute-time failures; non-Li-Fi errors fall back to generic tool mapping. */
export function mapLifiExecuteError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }
  if (isRecognizedLifiSdkError(err)) {
    return mapLifiError(err);
  }
  return mapAgentToolError(err);
}

/** Map Li-Fi SDK / REST errors to Radiant AppError codes. */
export function mapLifiError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }

  if (err instanceof SDKError) {
    const cause = err.cause;
    const rawMessage = sanitizeMessage(extractLifiErrorMessage(err) || extractLifiErrorMessage(cause));

    if (cause instanceof TransactionError) {
      return mapTransactionError(cause, rawMessage);
    }

    if (cause instanceof HTTPError) {
      const bodyMessage =
        typeof cause.responseBody?.message === "string" ? cause.responseBody.message : cause.message;
      return mapHttpStatus(cause.status, sanitizeMessage(bodyMessage));
    }

    if (/no route|unavailable routes|could not find/i.test(rawMessage)) {
      return new AppError(404, "LIFI_NO_ROUTE", userFacingLifiMessage(rawMessage));
    }
    if (/validation|invalid/i.test(rawMessage)) {
      return new AppError(400, "LIFI_VALIDATION_ERROR", userFacingLifiMessage(rawMessage));
    }
    return new AppError(503, "LIFI_UNAVAILABLE", userFacingTransactionMessage(cause.code, rawMessage));
  }

  if (err instanceof TransactionError) {
    const rawMessage = sanitizeMessage(extractLifiErrorMessage(err));
    return mapTransactionError(err, rawMessage);
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
    const message = sanitizeMessage(extractLifiErrorMessage(err));
    if (/abort|timeout|ETIMEDOUT|ECONNRESET/i.test(message)) {
      return new AppError(503, "LIFI_UNAVAILABLE", "Li-Fi request timed out.");
    }
    if (/no route|unavailable routes/i.test(message)) {
      return new AppError(404, "LIFI_NO_ROUTE", message);
    }
    if (/transaction failed|transactionerror/i.test(message)) {
      return new AppError(
        400,
        "TRANSACTION_FAILED",
        userFacingTransactionMessage(LiFiErrorCode.TransactionFailed, message),
        { cause: message },
      );
    }
    return new AppError(502, "LIFI_UNAVAILABLE", userFacingTransactionMessage(LiFiErrorCode.InternalError, message));
  }

  return new AppError(503, "LIFI_UNAVAILABLE", "Li-Fi request failed.");
}
