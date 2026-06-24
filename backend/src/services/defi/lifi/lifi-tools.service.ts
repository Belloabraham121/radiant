import { filterEnabledEvmChainIds } from "../../../config/supported-tokens.js";
import { isLifiEnabled } from "../../../config/lifi.js";
import { AppError } from "../../../errors/app-error.js";
import { lifiSdk } from "./lifi.client.js";
import { lifiCachedCatalogFetch, lifiToolsCacheKey } from "./lifi-cache.js";
import { consumeLifiOutboundQuota } from "./lifi-rate-limit.js";

function flattenBridgeChains(
  supportedChains: Array<{ fromChainId: number; toChainId: number }>,
): number[] {
  const ids = new Set<number>();
  for (const pair of supportedChains) {
    ids.add(pair.fromChainId);
    ids.add(pair.toChainId);
  }
  return filterEnabledEvmChainIds([...ids]);
}

export async function getLifiTools(userId: string) {
  if (!isLifiEnabled()) {
    throw new AppError(503, "LIFI_UNAVAILABLE", "Li-Fi is not enabled on this deployment.");
  }

  await consumeLifiOutboundQuota(userId);

  return lifiCachedCatalogFetch(lifiToolsCacheKey(), async () => {
    const tools = await lifiSdk.getTools();

    return {
      bridges: tools.bridges
        .map((bridge) => ({
          key: bridge.key,
          name: bridge.name,
          supported_chains: flattenBridgeChains(bridge.supportedChains),
        }))
        .filter((bridge) => bridge.supported_chains.length > 0),
      exchanges: tools.exchanges
        .map((exchange) => ({
          key: exchange.key,
          name: exchange.name,
          supported_chains: filterEnabledEvmChainIds(exchange.supportedChains),
        }))
        .filter((exchange) => exchange.supported_chains.length > 0),
    };
  });
}
