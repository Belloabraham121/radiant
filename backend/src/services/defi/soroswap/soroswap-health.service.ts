import { isSoroswapEnabled } from "../../../config/soroswap.js";
import { AppError } from "../../../errors/app-error.js";
import { soroswapRestFetch } from "./soroswap.client.js";
import { soroswapCachedCatalogFetch, soroswapHealthCacheKey } from "./soroswap-cache.js";
import { consumeSoroswapOutboundQuota } from "./soroswap-rate-limit.js";
import { soroswapHealthResponseSchema, type SoroswapHealthResponse } from "./soroswap.types.js";

export async function getSoroswapHealth(privyUserId?: string): Promise<SoroswapHealthResponse> {
  if (!isSoroswapEnabled()) {
    throw new AppError(503, "SOROSWAP_UNAVAILABLE", "Stellar swap service is temporarily unavailable.");
  }

  if (privyUserId) {
    await consumeSoroswapOutboundQuota(privyUserId);
  }

  return soroswapCachedCatalogFetch(soroswapHealthCacheKey(), async () => {
    const raw = await soroswapRestFetch<unknown>("/health");
    return soroswapHealthResponseSchema.parse(raw);
  });
}

/** Default protocols when health endpoint omits the list. */
export function defaultSoroswapProtocols(health?: SoroswapHealthResponse): string[] {
  const protocols = health?.protocols?.filter((entry) => typeof entry === "string") ?? [];
  if (protocols.length > 0) {
    return [...protocols].sort();
  }
  return ["aqua", "phoenix", "soroswap"];
}
