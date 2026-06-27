import { isSoroswapEnabled } from "../../../config/soroswap.js";
import { isSoroswapAllowedToken } from "../../../config/soroswap-chains.js";
import { AppError } from "../../../errors/app-error.js";
import { soroswapRestFetch } from "./soroswap.client.js";
import { soroswapCachedCatalogFetch, soroswapTokensCacheKey } from "./soroswap-cache.js";
import { consumeSoroswapOutboundQuota } from "./soroswap-rate-limit.js";
import { soroswapTokensResponseSchema, type SoroswapToken } from "./soroswap.types.js";

type GetSoroswapTokensFn = (privyUserId?: string) => Promise<SoroswapToken[]>;

let getSoroswapTokensForTests: GetSoroswapTokensFn | null = null;

/** Test hook — avoid Soroswap HTTP in unit tests. */
export function setGetSoroswapTokensForTests(fn: GetSoroswapTokensFn | null): void {
  getSoroswapTokensForTests = fn;
}

export async function getSoroswapTokens(privyUserId?: string): Promise<SoroswapToken[]> {
  if (getSoroswapTokensForTests) {
    return getSoroswapTokensForTests(privyUserId);
  }
  if (!isSoroswapEnabled()) {
    throw new AppError(503, "SOROSWAP_UNAVAILABLE", "Stellar swap service is temporarily unavailable.");
  }

  if (privyUserId) {
    await consumeSoroswapOutboundQuota(privyUserId);
  }

  const tokens = await soroswapCachedCatalogFetch(soroswapTokensCacheKey(), async () => {
    const raw = await soroswapRestFetch<unknown>("/api/tokens");
    return soroswapTokensResponseSchema.parse(raw);
  });

  return tokens.filter((token) => isSoroswapAllowedToken(token));
}
