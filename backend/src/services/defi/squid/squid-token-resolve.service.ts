import type { SquidChainRef } from "../../../config/squid-chains.js";
import type { SupportedToken } from "../../../config/supported-tokens.js";
import { radiantToSquidChainId, toSquidTokenAddress } from "./squid-chain-map.js";
import { getSquidTokens } from "./squid-token-catalog.service.js";
import type { SquidTokenEntry } from "./squid.types.js";

function catalogTokenMatchScore(entry: SquidTokenEntry, symbol: string): number {
  const sym = entry.symbol.toUpperCase();
  const normalized = symbol.toUpperCase();
  if (sym === normalized) {
    return 100;
  }
  if (sym === `${normalized}.E`) {
    return 50;
  }
  if (sym.startsWith(`${normalized}.`)) {
    return 40;
  }
  if (sym.includes(normalized)) {
    return 10;
  }
  return 0;
}

function rankCatalogTokenEntries(
  entries: SquidTokenEntry[],
  symbol: string,
): SquidTokenEntry[] {
  return [...entries]
    .filter((entry) => catalogTokenMatchScore(entry, symbol) > 0)
    .sort((a, b) => catalogTokenMatchScore(b, symbol) - catalogTokenMatchScore(a, symbol));
}

/** Squid catalog address for quotes — registry addresses may differ from Squid's routable tokens. */
export async function resolveSquidQuoteTokenAddress(input: {
  userId: string;
  token: SupportedToken;
  chainRef: SquidChainRef;
}): Promise<{ address: string; usedCatalogAlias: boolean }> {
  const registryAddress = toSquidTokenAddress(input.token, input.chainRef);
  const squidChainId = radiantToSquidChainId(input.chainRef);

  let catalog: SquidTokenEntry[] = [];
  try {
    const grouped = await getSquidTokens(input.userId, [squidChainId]);
    catalog = grouped[squidChainId] ?? [];
  } catch {
    return { address: registryAddress, usedCatalogAlias: false };
  }

  const registryInCatalog = catalog.find(
    (entry) => entry.address.toLowerCase() === registryAddress.toLowerCase(),
  );
  if (registryInCatalog) {
    return { address: registryInCatalog.address.toLowerCase(), usedCatalogAlias: false };
  }

  const ranked = rankCatalogTokenEntries(catalog, input.token.symbol);
  if (ranked.length > 0) {
    return { address: ranked[0]!.address.toLowerCase(), usedCatalogAlias: true };
  }

  return { address: registryAddress, usedCatalogAlias: false };
}

export { catalogTokenMatchScore, rankCatalogTokenEntries };
