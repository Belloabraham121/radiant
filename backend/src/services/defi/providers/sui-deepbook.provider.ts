import { deepbook, type DeepBookClient } from "@mysten/deepbook-v3";
import type { SuiGrpcClient } from "@mysten/sui/grpc";
import { getDeepBookEnv } from "../../../config/deepbook.js";
import { getSuiClient } from "../../../infrastructure/sui/client.js";
import type { DeepBookClientContext } from "../types.js";

export type SuiDeepBookExtendedClient = SuiGrpcClient & {
  deepbook: DeepBookClient;
};

let suiClientFactory: () => SuiGrpcClient = getSuiClient;
const clientCache = new Map<string, SuiDeepBookExtendedClient>();

function clientCacheKey(ctx: DeepBookClientContext): string {
  const managers = Object.entries(ctx.balanceManagers ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, manager]) =>
      [key, manager.address, manager.tradeCap ?? "", manager.depositCap ?? "", manager.withdrawCap ?? ""].join(
        ":",
      ),
    )
    .join("|");

  return `${ctx.address}::${managers}`;
}

/**
 * Build (or return cached) Sui client extended with DeepBook for the given wallet context.
 * One client per `(address, balanceManagers)` for the process lifetime.
 */
export function getSuiDeepBookClient(ctx: DeepBookClientContext): SuiDeepBookExtendedClient {
  const key = clientCacheKey(ctx);
  const cached = clientCache.get(key);
  if (cached) return cached;

  const { coins, pools } = getDeepBookEnv();
  const client = suiClientFactory().$extend(
    deepbook({
      address: ctx.address,
      balanceManagers: ctx.balanceManagers,
      coins,
      pools,
    }),
  ) as SuiDeepBookExtendedClient;

  clientCache.set(key, client);
  return client;
}

/** Convenience accessor for the DeepBook extension API. */
export function getDeepBookClient(ctx: DeepBookClientContext): DeepBookClient {
  return getSuiDeepBookClient(ctx).deepbook;
}

/** Test hook — inject a mock Sui client factory. */
export function setSuiClientFactoryForTests(factory: () => SuiGrpcClient): void {
  suiClientFactory = factory;
}

/** Drop cached DeepBook clients (e.g. after a new balance manager is persisted). */
export function clearDeepBookClientCache(): void {
  clientCache.clear();
}

/** Test hook — reset client cache and restore default factory. */
export function resetSuiDeepBookClientsForTests(): void {
  clearDeepBookClientCache();
  suiClientFactory = getSuiClient;
}
