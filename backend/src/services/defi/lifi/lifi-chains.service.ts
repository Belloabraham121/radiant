import { filterEnabledEvmChainIds } from "../../../config/supported-tokens.js";
import { isLifiEnabled } from "../../../config/lifi.js";
import { AppError } from "../../../errors/app-error.js";
import { lifiSdk } from "./lifi.client.js";
import { lifiCachedCatalogFetch, lifiChainsCacheKey } from "./lifi-cache.js";
import { consumeLifiOutboundQuota } from "./lifi-rate-limit.js";

export type LifiChainSummary = {
  id: number;
  key: string;
  name: string;
  chain_type: string;
};

export async function getLifiChains(userId: string): Promise<LifiChainSummary[]> {
  if (!isLifiEnabled()) {
    throw new AppError(503, "LIFI_UNAVAILABLE", "Li-Fi is not enabled on this deployment.");
  }

  await consumeLifiOutboundQuota(userId);

  return lifiCachedCatalogFetch(lifiChainsCacheKey(), async () => {
    const chains = await lifiSdk.getChains();
    const enabledIds = new Set(filterEnabledEvmChainIds(chains.map((chain) => chain.id)));

    return chains
      .filter((chain) => enabledIds.has(chain.id))
      .map((chain) => ({
        id: chain.id,
        key: chain.key,
        name: chain.name,
        chain_type: chain.chainType,
      }));
  });
}
