import { AppError } from "../../errors/app-error.js";

export type ExternalFetchInput = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export type ExternalFetchResult = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB
const FETCH_TIMEOUT_MS = 15_000;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "metadata.google.internal",
  "169.254.169.254",
]);

function validateUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AppError(400, "PROXY_INVALID_URL", `Invalid URL: ${raw}`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new AppError(
      400,
      "PROXY_INVALID_PROTOCOL",
      `Only http and https URLs are allowed. Got: ${parsed.protocol}`,
    );
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new AppError(
      403,
      "PROXY_BLOCKED_HOST",
      `Requests to ${hostname} are not allowed.`,
    );
  }

  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname)) {
    throw new AppError(
      403,
      "PROXY_BLOCKED_HOST",
      "Requests to private IP ranges are not allowed.",
    );
  }

  return parsed;
}

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

const STRIPPED_REQUEST_HEADERS = new Set([
  "host",
  "cookie",
  "authorization",
  "x-forwarded-for",
  "x-real-ip",
  "connection",
  "transfer-encoding",
]);

const STRIPPED_RESPONSE_HEADERS = new Set([
  "set-cookie",
  "transfer-encoding",
  "connection",
]);

export async function fetchExternal(input: ExternalFetchInput): Promise<ExternalFetchResult> {
  const url = validateUrl(input.url);
  const method = (input.method ?? "GET").toUpperCase();

  if (!ALLOWED_METHODS.has(method)) {
    throw new AppError(400, "PROXY_INVALID_METHOD", `Method ${method} is not allowed.`);
  }

  const headers: Record<string, string> = {};
  if (input.headers) {
    for (const [key, value] of Object.entries(input.headers)) {
      if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
        headers[key] = value;
      }
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      method,
      headers,
      body: method !== "GET" && method !== "HEAD" ? input.body : undefined,
      signal: controller.signal,
      redirect: "follow",
    });

    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
      throw new AppError(
        413,
        "PROXY_RESPONSE_TOO_LARGE",
        `Response exceeds ${MAX_RESPONSE_BYTES / 1024 / 1024} MB limit.`,
      );
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    const reader = res.body?.getReader();

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalSize += value.byteLength;
        if (totalSize > MAX_RESPONSE_BYTES) {
          reader.cancel();
          throw new AppError(
            413,
            "PROXY_RESPONSE_TOO_LARGE",
            `Response exceeds ${MAX_RESPONSE_BYTES / 1024 / 1024} MB limit.`,
          );
        }
        chunks.push(value);
      }
    }

    const bodyBuffer = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      bodyBuffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body = new TextDecoder().decode(bodyBuffer);

    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });

    return {
      status: res.status,
      headers: responseHeaders,
      body,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;

    if (err instanceof Error && err.name === "AbortError") {
      throw new AppError(
        504,
        "PROXY_TIMEOUT",
        `Request to ${url.hostname} timed out after ${FETCH_TIMEOUT_MS / 1000}s.`,
      );
    }

    throw new AppError(
      502,
      "PROXY_FETCH_FAILED",
      `Failed to fetch ${url.hostname}: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}
