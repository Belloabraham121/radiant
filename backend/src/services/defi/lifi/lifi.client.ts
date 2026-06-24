import {
  createClient,
  getChains,
  getConnections,
  getQuote,
  getRoutes,
  getStatus,
  getStepTransaction,
  getTokens,
  getTools,
  type SDKClient,
} from "@lifi/sdk";
import type { QuoteRequest, TokensRequest } from "@lifi/types";
import { getLifiConfig } from "../../../config/lifi.js";
import { mapLifiError } from "./lifi.errors.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_429_RETRIES = 3;

let fetchImpl: typeof globalThis.fetch = (...args) => fetch(...args);
let sdkClient: SDKClient | undefined;

export function setLifiFetchImplForTests(impl: typeof globalThis.fetch): void {
  fetchImpl = impl;
}

export function resetLifiClientForTests(): void {
  sdkClient = undefined;
  fetchImpl = (...args) => fetch(...args);
}

function buildSdkClient(): SDKClient {
  const config = getLifiConfig();
  return createClient({
    integrator: config.integrator,
    apiUrl: config.apiBaseUrl,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    debug: false,
  });
}

/** Shared Li-Fi SDK client (SDK-first for quotes, routes, steps, status). */
export function getLifiSdkClient(): SDKClient {
  if (!sdkClient) {
    sdkClient = buildSdkClient();
  }
  return sdkClient;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRestUrl(path: string): string {
  const config = getLifiConfig();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = config.apiBaseUrl.replace(/\/$/, "");
  if (normalizedPath.startsWith("/v1/") && base.endsWith("/v1")) {
    return `${base}${normalizedPath.slice(3)}`;
  }
  return `${base}${normalizedPath}`;
}

export type LifiRestFetchOptions = {
  method?: "GET" | "POST" | "PATCH";
  searchParams?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  timeoutMs?: number;
};

/**
 * REST fallback to `https://li.quest/v1` when SDK lacks a param or for `/advanced/*`.
 * Applies API key header, timeout, and exponential backoff on 429 (max 3).
 */
export async function lifiRestFetch<T>(path: string, options?: LifiRestFetchOptions): Promise<T> {
  const config = getLifiConfig();
  const url = new URL(buildRestUrl(path));

  if (options?.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (config.apiKey) {
    headers["x-lifi-api-key"] = config.apiKey;
  }
  if (options?.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const init: RequestInit = {
    method: options?.method ?? "GET",
    headers,
    ...(options?.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  };

  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      lastResponse = await fetchImpl(url.toString(), { ...init, signal: controller.signal });
    } catch (err) {
      clearTimeout(timeout);
      throw mapLifiError(err);
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
    let message = `Li-Fi REST ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string };
      if (typeof body.message === "string") {
        message = body.message;
      }
    } catch {
      // ignore parse errors
    }
    throw mapLifiError({ status: response.status, message });
  }

  return (await response.json()) as T;
}

/** Run an SDK action and map errors to Radiant AppError. */
export async function withLifiSdk<T>(fn: (client: SDKClient) => Promise<T>): Promise<T> {
  try {
    return await fn(getLifiSdkClient());
  } catch (err) {
    throw mapLifiError(err);
  }
}

export const lifiSdk = {
  getChains: () => withLifiSdk((client) => getChains(client)),
  getConnections: (params: Parameters<typeof getConnections>[1]) =>
    withLifiSdk((client) => getConnections(client, params)),
  getTools: () => withLifiSdk((client) => getTools(client)),
  getQuote: (params: QuoteRequest) => withLifiSdk((client) => getQuote(client, params)),
  getRoutes: (params: Parameters<typeof getRoutes>[1]) =>
    withLifiSdk((client) => getRoutes(client, params)),
  getStepTransaction: (step: Parameters<typeof getStepTransaction>[1]) =>
    withLifiSdk((client) => getStepTransaction(client, step)),
  getStatus: (params: Parameters<typeof getStatus>[1]) =>
    withLifiSdk((client) => getStatus(client, params)),
  getTokens: (params: TokensRequest) =>
    withLifiSdk((client) => getTokens(client, { ...params, extended: false })),
};
