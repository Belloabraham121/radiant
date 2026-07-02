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

const WORLD_CUP_QUERY_PATTERN = /\b(world\s*cup|fifa|fifwc|wc\s*20\d{2})\b/i;
const MENTION_MARKETS_TAG = "mention-markets";
const FIFA_WORLD_CUP_TAG = "fifa-world-cup";
const FIFWC_SLUG_PREFIX = "fifwc-";

function isWorldCupSearchContext(
  query: string,
  category?: PolymarketDiscoveryCategory,
  tag?: string,
): boolean {
  if (WORLD_CUP_QUERY_PATTERN.test(query)) return true;
  if (category === "sports" && tag?.trim().toLowerCase() === "soccer") return true;
  return false;
}

function hasMentionMarketsTag(market: PolymarketMarketSearchResult["markets"][0]): boolean {
  return market.tags.some((t) => t.toLowerCase() === MENTION_MARKETS_TAG);
}

function isFifwcMarket(market: PolymarketMarketSearchResult["markets"][0]): boolean {
  return (
    market.slug.toLowerCase().startsWith(FIFWC_SLUG_PREFIX) ||
    market.tags.some((t) => t.toLowerCase() === FIFA_WORLD_CUP_TAG)
  );
}

/** Rank match-winner / moneyline markets above props and mention markets. */
function matchWinnerRank(market: PolymarketMarketSearchResult["markets"][0]): number {
  const slug = market.slug.toLowerCase();
  if (hasMentionMarketsTag(market)) return -10;
  if (/-win\b|-draw\b|match-winner|moneyline/.test(slug)) return 3;
  if (slug.includes("draw")) return 2;
  if (/-vs-/.test(slug)) return 1;
  if (isFifwcMarket(market)) return 1;
  return 0;
}

/** Post-filter and rank World Cup soccer markets for builder search. Exported for unit tests. */
export function filterWorldCupMarkets(
  markets: PolymarketMarketSearchResult["markets"],
  query: string,
  category?: PolymarketDiscoveryCategory,
  tag?: string,
): PolymarketMarketSearchResult["markets"] {
  if (!isWorldCupSearchContext(query, category, tag)) {
    return markets;
  }

  let filtered = markets.filter((m) => !hasMentionMarketsTag(m));
  const fifwc = filtered.filter(isFifwcMarket);
  if (fifwc.length > 0) {
    filtered = fifwc;
  }

  const activeOpen = filtered.filter((m) => m.active && !m.closed);
  if (activeOpen.length > 0) {
    filtered = activeOpen;
  }

  return [...filtered].sort((a, b) => matchWinnerRank(b) - matchWinnerRank(a));
}

/** First clob token id for the YES outcome when outcomes are labeled. */
export function recommendedYesAssetId(
  market: PolymarketMarketSearchResult["markets"][0],
): string | undefined {
  const { outcomes, clob_token_ids: tokens } = market;
  if (tokens.length === 0) return undefined;
  const yesIndex = outcomes.findIndex((o) => o.trim().toLowerCase() === "yes");
  if (yesIndex >= 0 && tokens[yesIndex]) return tokens[yesIndex];
  return tokens[0];
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
    markets = filterWorldCupMarkets(markets, query, input.category, input.tag);
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
