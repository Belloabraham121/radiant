import { getSoroswapConfig } from "../../../config/soroswap.js";
import { mapSoroswapError } from "./soroswap.errors.js";

export const DEFAULT_SOROSWAP_TIMEOUT_MS = 30_000;
const MAX_429_RETRIES = 3;

let fetchImpl: typeof globalThis.fetch = (...args) => fetch(...args);

export function setSoroswapFetchImplForTests(impl: typeof globalThis.fetch): void {
  fetchImpl = impl;
}

export function resetSoroswapClientForTests(): void {
  fetchImpl = (...args) => fetch(...args);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type SoroswapRestFetchInit = {
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
};

/**
 * Soroswap REST fetch — Bearer auth, `?network=` query param, JSON parse, 429 backoff.
 * Never logs or surfaces API keys in thrown errors.
 */
export async function soroswapRestFetch<T>(
  path: string,
  init?: SoroswapRestFetchInit,
): Promise<T> {
  const config = getSoroswapConfig();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(normalizedPath, `${config.apiBaseUrl}/`);
  url.searchParams.set("network", config.network);

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (init?.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const requestInit: RequestInit = {
    method: init?.method ?? "GET",
    headers,
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  };

  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      init?.timeoutMs ?? DEFAULT_SOROSWAP_TIMEOUT_MS,
    );

    try {
      lastResponse = await fetchImpl(url.toString(), {
        ...requestInit,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      throw mapSoroswapError(err);
    } finally {
      clearTimeout(timeout);
    }

    if (lastResponse.status === 429 && attempt < MAX_429_RETRIES) {
      await sleep(2 ** attempt * 500);
      continue;
    }

    break;
  }

  const response = lastResponse!;
  if (!response.ok) {
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      // ignore parse errors
    }
    throw mapSoroswapError({
      response: {
        status: response.status,
        data,
      },
    });
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw mapSoroswapError(new Error("Soroswap response was not valid JSON."));
  }
}
