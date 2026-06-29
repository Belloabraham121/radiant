import { AppError } from "../../../../errors/app-error.js";
import { getPolymarketConfig } from "./polymarket.config.js";
import { consumePolymarketRestToken } from "./polymarket-rate-limit.js";
import type { PolymarketDiscoveryMarket } from "./polymarket-gamma.types.js";

let fetchImpl: typeof globalThis.fetch = (...args) => fetch(...args);

type GammaTag = { slug?: string; label?: string };
type GammaMarketRaw = {
  id?: string | number;
  slug?: string;
  question?: string;
  outcomes?: string | string[];
  clobTokenIds?: string | string[];
  active?: boolean;
  closed?: boolean;
  tags?: GammaTag[];
};
type GammaEventRaw = {
  title?: string;
  tags?: GammaTag[];
  markets?: GammaMarketRaw[];
};
type GammaSearchResponse = {
  events?: GammaEventRaw[] | null;
  pagination?: { hasMore?: boolean; totalResults?: number };
};
type GammaMarketsListResponse = GammaMarketRaw[];

function parseJsonStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v));
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v));
      }
    } catch {
      return [];
    }
  }
  return [];
}

function tagSlugs(tags: GammaTag[] | undefined): string[] {
  if (!tags?.length) return [];
  return tags
    .map((t) => t.slug?.trim())
    .filter((s): s is string => Boolean(s));
}

function primaryCategory(tags: string[]): string | null {
  const priority = ["sports", "politics", "crypto", "finance", "science", "culture"];
  for (const slug of priority) {
    if (tags.includes(slug)) return slug;
  }
  return tags[0] ?? null;
}

function normalizeMarket(raw: GammaMarketRaw, event?: GammaEventRaw): PolymarketDiscoveryMarket | null {
  const id = raw.id !== undefined ? String(raw.id) : "";
  const slug = raw.slug?.trim() ?? "";
  const question = raw.question?.trim() ?? "";
  if (!id || !question) return null;

  const marketTags = tagSlugs(raw.tags);
  const eventTags = tagSlugs(event?.tags);
  const tags = [...new Set([...marketTags, ...eventTags])];

  return {
    id,
    slug,
    question,
    event_title: event?.title?.trim() ?? null,
    category: primaryCategory(tags),
    tags,
    outcomes: parseJsonStringArray(raw.outcomes),
    clob_token_ids: parseJsonStringArray(raw.clobTokenIds),
    active: raw.active ?? true,
    closed: raw.closed ?? false,
  };
}

async function gammaFetch(path: string, searchParams?: Record<string, string>): Promise<Response> {
  const allowed = await consumePolymarketRestToken();
  if (!allowed) {
    throw new AppError(429, "RATE_LIMITED", "Polymarket Gamma API rate limit exceeded.");
  }

  const config = getPolymarketConfig();
  const url = new URL(`${config.gammaBaseUrl}${path}`);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  return fetchImpl(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": config.gammaUserAgent,
    },
  });
}

function dedupeMarkets(markets: PolymarketDiscoveryMarket[]): PolymarketDiscoveryMarket[] {
  const seen = new Set<string>();
  const out: PolymarketDiscoveryMarket[] = [];
  for (const market of markets) {
    if (seen.has(market.id)) continue;
    seen.add(market.id);
    out.push(market);
  }
  return out;
}

export async function gammaPublicSearchMarkets(input: {
  q: string;
  tagSlugs?: string[];
  limit: number;
  offset: number;
}): Promise<{ markets: PolymarketDiscoveryMarket[]; hasMore: boolean; total: number }> {
  const page = Math.floor(input.offset / Math.max(input.limit, 1)) + 1;
  const params: Record<string, string> = {
    q: input.q,
    limit_per_type: String(input.limit),
    page: String(page),
    search_profiles: "false",
    search_tags: "false",
    keep_closed_markets: "0",
  };
  if (input.tagSlugs?.length) {
    params.events_tag = input.tagSlugs[input.tagSlugs.length - 1]!;
  }

  const response = await gammaFetch("/public-search", params);
  if (!response.ok) {
    throw new AppError(
      response.status,
      "POLYMARKET_GAMMA_SEARCH_FAILED",
      `Polymarket search failed (${response.status}).`,
    );
  }

  const payload = (await response.json()) as GammaSearchResponse;
  const markets: PolymarketDiscoveryMarket[] = [];
  for (const event of payload.events ?? []) {
    for (const raw of event.markets ?? []) {
      const normalized = normalizeMarket(raw, event);
      if (normalized) markets.push(normalized);
    }
  }

  const deduped = dedupeMarkets(markets);
  const total = payload.pagination?.totalResults ?? deduped.length;
  return {
    markets: deduped,
    hasMore: payload.pagination?.hasMore ?? deduped.length >= input.limit,
    total,
  };
}

export async function gammaListMarkets(input: {
  tagSlug?: string;
  limit: number;
  offset: number;
}): Promise<{ markets: PolymarketDiscoveryMarket[]; hasMore: boolean }> {
  const params: Record<string, string> = {
    active: "true",
    closed: "false",
    limit: String(input.limit),
    offset: String(input.offset),
    order: "volume24hr",
    ascending: "false",
  };
  if (input.tagSlug) {
    params.tag_slug = input.tagSlug;
  }

  const response = await gammaFetch("/markets", params);
  if (!response.ok) {
    throw new AppError(
      response.status,
      "POLYMARKET_GAMMA_LIST_FAILED",
      `Polymarket market list failed (${response.status}).`,
    );
  }

  const payload = (await response.json()) as GammaMarketsListResponse;
  const markets = dedupeMarkets(
    payload
      .map((raw) => normalizeMarket(raw))
      .filter((m): m is PolymarketDiscoveryMarket => m !== null),
  );

  return {
    markets,
    hasMore: markets.length >= input.limit,
  };
}

export async function gammaGetMarketById(id: string): Promise<PolymarketDiscoveryMarket | null> {
  const response = await gammaFetch(`/markets/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new AppError(
      response.status,
      "POLYMARKET_GAMMA_MARKET_FAILED",
      `Polymarket market lookup failed (${response.status}).`,
    );
  }

  const payload = (await response.json()) as GammaMarketRaw;
  return normalizeMarket(payload);
}

/** Test hook */
export function setPolymarketGammaFetchForTests(fn: typeof fetchImpl | null): void {
  fetchImpl = fn ?? ((...args) => fetch(...args));
}

export function resetPolymarketGammaClientForTests(): void {
  fetchImpl = (...args) => fetch(...args);
}
