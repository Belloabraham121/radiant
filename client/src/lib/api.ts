/** Backend origin — used for Next.js rewrites and server-side fetches. */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
  try {
    body = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError(response.status, "PARSE_ERROR", "Invalid API response");
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
