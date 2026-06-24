import { AppError } from "../../../errors/app-error.js";
import { logger } from "../../../shared/logger.js";
import {
  CALL_API_SSRF_ERROR_CODES,
  fetchWithSsrfGuard,
  sanitizeOutboundRequestHeaders,
  validateOutboundUrl,
} from "../../proxy/ssrf-guard.js";

export type CallApiInput = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export type CallApiOutput = {
  url: string;
  method: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
};

const MAX_RESPONSE_BYTES = 100_000;
const REQUEST_TIMEOUT_MS = 30_000;

const ALLOWED_METHODS = new Set([
  "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS",
]);

export async function callApi(input: CallApiInput): Promise<CallApiOutput> {
  const method = (input.method ?? "GET").toUpperCase();

  if (!ALLOWED_METHODS.has(method)) {
    throw new AppError(400, "INVALID_METHOD", `HTTP method not allowed: ${method}`);
  }

  const parsed = validateOutboundUrl(input.url, CALL_API_SSRF_ERROR_CODES);

  const headers = sanitizeOutboundRequestHeaders(
    {
      "User-Agent": "RadiantAgent/1.0",
      Accept: "application/json, text/plain, */*",
      ...(input.headers ?? {}),
    },
    parsed.hostname,
  );

  const fetchInit: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };

  if (input.body && method !== "GET" && method !== "HEAD") {
    fetchInit.body = input.body;
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
  }

  let response: Response;
  try {
    response = await fetchWithSsrfGuard(parsed, fetchInit, {
      codes: CALL_API_SSRF_ERROR_CODES,
    });
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("call_api fetch error", { url: input.url, error: msg });
    throw new AppError(502, "FETCH_FAILED", `API call failed: ${msg}`);
  }

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  let body: string;
  let truncated = false;
  try {
    const raw = await response.text();
    if (raw.length > MAX_RESPONSE_BYTES) {
      body = raw.slice(0, MAX_RESPONSE_BYTES);
      truncated = true;
    } else {
      body = raw;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AppError(502, "READ_FAILED", `Could not read API response: ${msg}`);
  }

  return {
    url: input.url,
    method,
    status: response.status,
    headers: responseHeaders,
    body,
    truncated,
  };
}
