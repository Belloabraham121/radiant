import { createRequire } from "node:module";
import type { Squid as SquidClient } from "@0xsquid/sdk";
import { getSquidConfig } from "../../../config/squid.js";
import { mapSquidError } from "./squid.errors.js";
import { buildSquidSdkConfig, DEFAULT_SQUID_TIMEOUT_MS } from "./squid.client.config.js";
import type { SquidRouteRequest, SquidRouteResponse, SquidExecuteRouteRequest, SquidExecuteRouteResponse, SquidGetStatusRequest } from "./squid.types.js";
import type { StatusResponse } from "@0xsquid/sdk/dist/types/index.js";

const require = createRequire(import.meta.url);
const MAX_429_RETRIES = 3;

let sdkInstance: SquidClient | undefined;
let initPromise: Promise<void> | undefined;

export { buildSquidSdkConfig, DEFAULT_SQUID_TIMEOUT_MS } from "./squid.client.config.js";

export function resetSquidClientForTests(): void {
  sdkInstance = undefined;
  initPromise = undefined;
}

function instantiateSquid(): SquidClient {
  const { Squid } = require("@0xsquid/sdk") as typeof import("@0xsquid/sdk");
  return new Squid(buildSquidSdkConfig());
}

export function getSquidSdk(): SquidClient {
  if (!sdkInstance) {
    sdkInstance = instantiateSquid();
  }
  return sdkInstance;
}

async function ensureSquidInitialized(): Promise<SquidClient> {
  const sdk = getSquidSdk();
  if (!sdk.initialized) {
    if (!initPromise) {
      initPromise = sdk.init().catch((err: unknown) => {
        initPromise = undefined;
        throw err;
      });
    }
    await initPromise;
  }
  return sdk;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAxios429(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("response" in err)) {
    return false;
  }
  return (err as { response?: { status?: number } }).response?.status === 429;
}

/** Run an SDK action with lazy init, 429 backoff (max 3), and mapped errors. */
export async function withSquidSdk<T>(fn: (sdk: SquidClient) => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    try {
      const sdk = await ensureSquidInitialized();
      return await fn(sdk);
    } catch (err) {
      if (isAxios429(err) && attempt < MAX_429_RETRIES) {
        lastError = err;
        await sleep(2 ** attempt * 500);
        continue;
      }
      throw mapSquidError(err);
    }
  }

  throw mapSquidError(lastError);
}

async function postSquidDepositAddress(transactionRequest: unknown): Promise<unknown> {
  const config = getSquidConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_SQUID_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.apiBaseUrl}/v2/deposit-address`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-integrator-id": config.integratorId,
      },
      body: JSON.stringify(transactionRequest),
      signal: controller.signal,
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      throw {
        response: {
          status: response.status,
          data,
        },
      };
    }
    return data;
  } catch (err) {
    throw mapSquidError(err);
  } finally {
    clearTimeout(timeout);
  }
}

export const squidSdk = {
  getRoute: (params: SquidRouteRequest): Promise<SquidRouteResponse> =>
    withSquidSdk((sdk) => sdk.getRoute(params)),
  executeRoute: (params: SquidExecuteRouteRequest): Promise<SquidExecuteRouteResponse> =>
    withSquidSdk((sdk) => sdk.executeRoute(params)),
  getStatus: (params: SquidGetStatusRequest): Promise<StatusResponse> =>
    withSquidSdk((sdk) => sdk.getStatus(params)),
  isRouteApproved: (
    params: Parameters<SquidClient["isRouteApproved"]>[0],
  ): ReturnType<SquidClient["isRouteApproved"]> =>
    withSquidSdk((sdk) => sdk.isRouteApproved(params)),
  approveRoute: (params: SquidExecuteRouteRequest): Promise<SquidExecuteRouteResponse | null> =>
    withSquidSdk((sdk) => sdk.approveRoute(params)),
  requestDepositAddress: (params: { route: SquidRouteResponse["route"] }): Promise<unknown> =>
    postSquidDepositAddress(params.route.transactionRequest),
};
