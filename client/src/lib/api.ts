import { API_BASE_URL } from "./api-config";
import { messageForApiFailure } from "./api-error-messages";

/** Backend origin — used for Next.js rewrites and server-side fetches. */
export { API_BASE_URL };

/**
 * Browser: same-origin (`/api/v1/...`) so Privy cookies on the app host are sent.
 * Server: direct backend URL from `NEXT_PUBLIC_API_URL`.
 */
export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  return API_BASE_URL;
}

export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  return base ? `${base}${path}` : path;
}

export type ApiMeta = {
  correlation_id: string;
  timestamp: string;
  pagination?: unknown;
};

export type ApiEnvelope<T> = {
  success: boolean;
  data: T | null;
  meta: ApiMeta;
  error: { code: string; message: string; details?: unknown } | null;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const TRANSIENT_RETRY_DELAY_MS = 400;

function isIdempotentMethod(method: string): boolean {
  const upper = method.toUpperCase();
  return upper === "GET" || upper === "HEAD";
}

function isTransientApiError(err: unknown): err is ApiError {
  if (!(err instanceof ApiError)) {
    return false;
  }
  return (
    err.code === "NETWORK_ERROR" ||
    (err.code === "PARSE_ERROR" &&
      (err.status === 0 || err.status === 502 || err.status === 504))
  );
}

async function apiFetchOnce<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      credentials: "include",
      headers,
    });
  } catch {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      messageForApiFailure(path, "network", method),
    );
  }

  let body: ApiEnvelope<T>;
  const rawText = await response.text();
  try {
    body = JSON.parse(rawText) as ApiEnvelope<T>;
  } catch {
    const proxyFailure =
      rawText.length === 0 ||
      /socket hang up|ECONNREFUSED|ECONNRESET|Internal Server Error/i.test(rawText);
    const likelyTimeout = response.status === 504 || response.status === 502;

    let kind: "timeout" | "unreachable" | "invalid" = "invalid";
    if (likelyTimeout || (proxyFailure && response.status >= 500)) {
      kind = "timeout";
    } else if (proxyFailure) {
      kind = "unreachable";
    }

    throw new ApiError(
      response.status,
      "PARSE_ERROR",
      messageForApiFailure(path, kind, method),
    );
  }

  if (!response.ok || !body.success || body.data === null) {
    throw new ApiError(
      response.status,
      body.error?.code ?? "REQUEST_FAILED",
      body.error?.message ?? "Request failed",
      body.error?.details,
    );
  }

  return body.data;
}

/** Authenticated fetch against the Radiant API (cookies included). */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  const maxAttempts = isIdempotentMethod(method) ? 2 : 1;

  let lastError: ApiError | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS));
    }

    try {
      return await apiFetchOnce<T>(path, init);
    } catch (err) {
      if (!isTransientApiError(err) || attempt === maxAttempts - 1) {
        throw err;
      }
      lastError = err;
    }
  }

  throw lastError ?? new ApiError(0, "NETWORK_ERROR", "Request failed");
}
