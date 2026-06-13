import { API_BASE_URL } from "./api-config";

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

/** Authenticated fetch against the Radiant API (cookies included). */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers,
  });

  let body: ApiEnvelope<T>;
  const rawText = await response.text();
  try {
    body = JSON.parse(rawText) as ApiEnvelope<T>;
  } catch {
    const proxyFailure =
      rawText.length === 0 ||
      /socket hang up|ECONNREFUSED|ECONNRESET|Internal Server Error/i.test(rawText);
    const likelyTimeout = response.status === 504 || response.status === 502;

    let message = "Invalid API response";
    if (likelyTimeout || (proxyFailure && response.status >= 500)) {
      message =
        "The agent request took too long or the connection dropped. " +
        "Your backend may still be processing — wait a moment and refresh the chat. " +
        "If it keeps happening, try a shorter question first.";
    } else if (proxyFailure) {
      message =
        "Could not reach the API server. Make sure the backend is running (npm run dev in backend/).";
    }

    throw new ApiError(response.status, "PARSE_ERROR", message);
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
