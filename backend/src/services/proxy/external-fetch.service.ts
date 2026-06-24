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
const MAX_REDIRECTS = 5;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "::1",
  "metadata.google.internal",
  "169.254.169.254",
]);

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);

  if (BLOCKED_HOSTNAMES.has(normalized) || BLOCKED_HOSTNAMES.has(hostname)) {
    return true;
  }

  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.)/.test(normalized)) {
    return true;
  }

  if (normalized.includes(":")) {
    if (normalized === "::" || normalized.startsWith("fe80:")) {
      return true;
    }
    if (/^f[cd][0-9a-f]{2}:/i.test(normalized)) {
      return true;
    }
    if (normalized.startsWith("::ffff:")) {
      const mapped = normalized.slice("::ffff:".length);
      if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.)/.test(mapped)) {
        return true;
      }
    }
  }

  return false;
}

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

  const hostname = parsed.hostname;
  if (isPrivateOrLocalHostname(hostname)) {
    throw new AppError(
      403,
      "PROXY_BLOCKED_HOST",
      `Requests to ${hostname} are not allowed.`,
    );
  }

  return parsed;
}

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

const STRIPPED_REQUEST_HEADERS = new Set([
  "host",
  "cookie",
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

async function readResponseBody(res: Response): Promise<string> {
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
  return new TextDecoder().decode(bodyBuffer);
}

async function fetchWithoutRedirect(
  url: URL,
  init: RequestInit,
): Promise<Response> {
  let currentUrl = url;
  let redirectCount = 0;

  while (true) {
    const res = await fetch(currentUrl.toString(), {
      ...init,
      redirect: "manual",
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new AppError(
          502,
          "PROXY_REDIRECT_ERROR",
          `Redirect response from ${currentUrl.hostname} missing Location header.`,
        );
      }

      redirectCount += 1;
      if (redirectCount > MAX_REDIRECTS) {
        throw new AppError(
          502,
          "PROXY_TOO_MANY_REDIRECTS",
          `Too many redirects while fetching ${url.hostname}.`,
        );
      }

      currentUrl = validateUrl(new URL(location, currentUrl).toString());
      continue;
    }

    return res;
  }
}

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
    const res = await fetchWithoutRedirect(url, {
      method,
      headers,
      body: method !== "GET" && method !== "HEAD" ? input.body : undefined,
      signal: controller.signal,
    });

    const body = await readResponseBody(res);

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
