import { isSquidEnabled } from "../../../config/squid.js";
import { filterEnabledSquidChainIds } from "../../../config/squid-chains.js";
import { AppError } from "../../../errors/app-error.js";
import { withSquidSdk } from "./squid.client.js";
import { squidCachedCatalogFetch, squidTokensCacheKey } from "./squid-cache.js";
import { consumeSquidOutboundQuota } from "./squid-rate-limit.js";
import { squidTokenSchema, type SquidTokenEntry } from "./squid.types.js";

type GetSquidTokensFn = (
  userId: string,
  chainIds: string[],
) => Promise<Record<string, SquidTokenEntry[]>>;

let getSquidTokensForTests: GetSquidTokensFn | null = null;

/** Test hook — avoid Squid SDK init in unit tests. */
export function setGetSquidTokensForTests(fn: GetSquidTokensFn | null): void {
  getSquidTokensForTests = fn;
}

export async function getSquidTokens(
  userId: string,
  chainIds: string[],
): Promise<Record<string, SquidTokenEntry[]>> {
  if (getSquidTokensForTests) {
    return getSquidTokensForTests(userId, chainIds);
  }
  if (!isSquidEnabled()) {
    throw new AppError(503, "SQUID_UNAVAILABLE", "Squid is not enabled on this deployment.");
  }

  const filtered = filterEnabledSquidChainIds(chainIds);
  if (filtered.length === 0) {
    throw new AppError(400, "CHAIN_NOT_ENABLED", "No enabled Squid chain ids were provided.");
  }

  await consumeSquidOutboundQuota(userId);

  return squidCachedCatalogFetch(squidTokensCacheKey(filtered), async () => {
    const tokens = await withSquidSdk((sdk) => Promise.resolve(sdk.tokens));
    const enabled = new Set(filtered);
    const grouped: Record<string, SquidTokenEntry[]> = {};

    for (const token of tokens) {
      const chainId = String(token.chainId);
      if (!enabled.has(chainId)) {
        continue;
      }
      const parsed = squidTokenSchema.parse(token);
      const key = String(parsed.chainId);
      grouped[key] ??= [];
      grouped[key].push(parsed);
    }

    return grouped;
  });
}
