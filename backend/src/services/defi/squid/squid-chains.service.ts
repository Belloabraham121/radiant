import { isSquidEnabled } from "../../../config/squid.js";
import { filterEnabledSquidChainIds } from "../../../config/squid-chains.js";
import { AppError } from "../../../errors/app-error.js";
import { withSquidSdk } from "./squid.client.js";
import { squidCachedCatalogFetch, squidChainsCacheKey } from "./squid-cache.js";
import { consumeSquidOutboundQuota } from "./squid-rate-limit.js";
import { squidChainSchema, type SquidChainSummary } from "./squid.types.js";

export async function getSquidChains(userId: string): Promise<SquidChainSummary[]> {
  if (!isSquidEnabled()) {
    throw new AppError(503, "SQUID_UNAVAILABLE", "Squid is not enabled on this deployment.");
  }

  await consumeSquidOutboundQuota(userId);

  return squidCachedCatalogFetch(squidChainsCacheKey(), async () => {
    const chains = await withSquidSdk((sdk) => Promise.resolve(sdk.chains));
    const enabledIds = new Set(filterEnabledSquidChainIds(chains.map((chain) => String(chain.chainId))));

    return chains
      .filter((chain) => enabledIds.has(String(chain.chainId)))
      .map((chain) => {
        const parsed = squidChainSchema.parse(chain);
        return {
          id: String(parsed.chainId),
          name: parsed.networkName ?? parsed.chainName ?? String(parsed.chainId),
          chain_type: parsed.chainType ?? "unknown",
        };
      });
  });
}
