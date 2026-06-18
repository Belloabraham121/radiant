import { AppError } from "../../../errors/app-error.js";
import { logger } from "../../../shared/logger.js";

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

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "169.254.169.254",
  "metadata.google.internal",
]);

const MAX_RESPONSE_BYTES = 100_000;
const REQUEST_TIMEOUT_MS = 30_000;

const ALLOWED_METHODS = new Set([
  "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS",
]);

function isBlockedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      BLOCKED_HOSTS.has(parsed.hostname) ||
      parsed.hostname.endsWith(".internal") ||
      parsed.protocol === "file:"
    );
  } catch {
    return true;
  }
}

export async function callApi(input: CallApiInput): Promise<CallApiOutput> {
  const method = (input.method ?? "GET").toUpperCase();

  if (!ALLOWED_METHODS.has(method)) {
    throw new AppError(400, "INVALID_METHOD", `HTTP method not allowed: ${method}`);
  }

  if (isBlockedUrl(input.url)) {
    throw new AppError(400, "BLOCKED_URL", "Cannot call internal or local URLs.");
  }

  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    throw new AppError(400, "INVALID_URL", `Invalid URL: ${input.url}`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new AppError(400, "INVALID_PROTOCOL", "Only http and https URLs are supported.");
  }

  const headers: Record<string, string> = {
    "User-Agent": "RadiantAgent/1.0",
    Accept: "application/json, text/plain, */*",
    ...(input.headers ?? {}),
  };

  const fetchInit: RequestInit = {
    method,
    headers,
    redirect: "follow",
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
    response = await fetch(input.url, fetchInit);
  } catch (err) {
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
