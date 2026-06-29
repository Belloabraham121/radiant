import { AppError } from "../../../../errors/app-error.js";
import {
  gammaGetMarketById,
  gammaListMarkets,
  gammaPublicSearchMarkets,
} from "./polymarket-gamma.client.js";
import {
  POLYMARKET_DISCOVERY_CATEGORIES,
  type PolymarketDiscoveryCategory,
  type PolymarketMarketSearchResult,
} from "./polymarket-gamma.types.js";

export type SearchPolymarketMarketsInput = {
  q?: string;
  category?: PolymarketDiscoveryCategory;
  tag?: string;
  limit?: number;
  offset?: number;
};

function resolveTagSlugs(input: SearchPolymarketMarketsInput): string[] {
  const tags: string[] = [];
  if (input.category) {
    const mapped = POLYMARKET_DISCOVERY_CATEGORIES[input.category];
    if (mapped) tags.push(mapped);
  }
  if (input.tag?.trim()) {
    tags.push(input.tag.trim().toLowerCase());
  }
  return [...new Set(tags)];
}

function clampLimit(limit: number | undefined): number {
  const value = limit ?? 20;
  return Math.min(50, Math.max(1, value));
}

function clampOffset(offset: number | undefined): number {
  const value = offset ?? 0;
  return Math.max(0, value);
}

export async function searchPolymarketMarkets(
  input: SearchPolymarketMarketsInput,
): Promise<PolymarketMarketSearchResult> {
  const limit = clampLimit(input.limit);
  const offset = clampOffset(input.offset);
  const tagSlugs = resolveTagSlugs(input);
  const query = input.q?.trim() ?? "";

  if (query.length > 0) {
    const result = await gammaPublicSearchMarkets({
      q: query,
      tagSlugs: tagSlugs.length ? tagSlugs : undefined,
      limit,
      offset,
    });
    let markets = result.markets;
    if (tagSlugs.length > 1) {
      const required = new Set(tagSlugs);
      markets = markets.filter((m) => {
        const marketTags = new Set(m.tags);
        for (const tag of required) {
          if (!marketTags.has(tag)) return false;
        }
        return true;
      });
    }
    return {
      markets,
      total: markets.length,
      has_more: result.hasMore,
    };
  }

  if (tagSlugs.length === 0) {
    throw new AppError(
      400,
      "INVALID_QUERY",
      "Provide a search query (q) or filter by category/tag.",
    );
  }

  const primaryTag = tagSlugs[tagSlugs.length - 1]!;
  const result = await gammaListMarkets({
    tagSlug: primaryTag,
    limit,
    offset,
  });

  let markets = result.markets;
  if (tagSlugs.length > 1) {
    const required = new Set(tagSlugs);
    markets = markets.filter((m) => {
      const marketTags = new Set(m.tags);
      for (const tag of required) {
        if (!marketTags.has(tag)) return false;
      }
      return true;
    });
  }

  return {
    markets,
    total: markets.length,
    has_more: result.hasMore,
  };
}

export async function getPolymarketMarketById(id: string): Promise<PolymarketMarketSearchResult["markets"][0] | null> {
  const trimmed = id.trim();
  if (!trimmed) {
    throw new AppError(400, "INVALID_MARKET_ID", "Market id is required.");
  }
  return gammaGetMarketById(trimmed);
}
