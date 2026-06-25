import { filterEnabledEvmChainIds } from "../../../config/supported-tokens.js";
import { isLifiEnabled } from "../../../config/lifi.js";
import { AppError } from "../../../errors/app-error.js";
import { lifiSdk } from "./lifi.client.js";
import { lifiCachedCatalogFetch, lifiTokensCacheKey } from "./lifi-cache.js";
import { consumeLifiOutboundQuota } from "./lifi-rate-limit.js";
import { assertEnabledLifiEvmChain } from "./lifi-chain-map.js";
import { lifiTokensResponseSchema, type lifiTokenSchema } from "./lifi.types.js";
import type { z } from "zod";

export type LifiTokenEntry = z.infer<typeof lifiTokenSchema>;

export async function getLifiTokens(
  userId: string,
  chainIds: number[],
): Promise<Record<string, LifiTokenEntry[]>> {
  if (!isLifiEnabled()) {
    throw new AppError(503, "LIFI_UNAVAILABLE", "Li-Fi is not enabled on this deployment.");
  }

  const filtered = filterEnabledEvmChainIds(chainIds);
  if (filtered.length === 0) {
    throw new AppError(400, "CHAIN_NOT_ENABLED", "No enabled EVM chain ids were provided.");
  }

  for (const chainId of filtered) {
    assertEnabledLifiEvmChain(chainId);
  }

  await consumeLifiOutboundQuota(userId);

  return lifiCachedCatalogFetch(lifiTokensCacheKey(filtered), async () => {
    const response = await lifiSdk.getTokens({ chains: filtered, extended: false });
    return lifiTokensResponseSchema.parse({ tokens: response.tokens }).tokens;
  });
}
