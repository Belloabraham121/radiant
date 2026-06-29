import { apiFetch } from "@/lib/api";

export type PolymarketDiscoveryMarket = {
  id: string;
  slug: string;
  question: string;
  event_title: string | null;
  category: string | null;
  tags: string[];
  outcomes: string[];
  clob_token_ids: string[];
  active: boolean;
  closed: boolean;
};

export type PolymarketMarketSearchResponse = {
  markets: PolymarketDiscoveryMarket[];
  total: number;
  has_more: boolean;
};

export type PolymarketDiscoveryCategory = "sports" | "politics" | "crypto";

export const POLYMARKET_CATEGORY_OPTIONS: Array<{
  value: PolymarketDiscoveryCategory | "all";
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "sports", label: "Sports" },
  { value: "politics", label: "News/Politics" },
  { value: "crypto", label: "Crypto" },
];

export const POLYMARKET_SPORTS_LEAGUE_OPTIONS = [
  { value: "", label: "All leagues" },
  { value: "nfl", label: "NFL" },
  { value: "nba", label: "NBA" },
  { value: "mlb", label: "MLB" },
  { value: "nhl", label: "NHL" },
  { value: "soccer", label: "Soccer" },
  { value: "ncaa", label: "NCAA" },
  { value: "ufc", label: "UFC" },
  { value: "golf", label: "Golf" },
] as const;

export async function searchPolymarketMarkets(input: {
  q?: string;
  category?: PolymarketDiscoveryCategory;
  tag?: string;
  limit?: number;
  offset?: number;
}): Promise<PolymarketMarketSearchResponse> {
  const params = new URLSearchParams();
  if (input.q?.trim()) params.set("q", input.q.trim());
  if (input.category) params.set("category", input.category);
  if (input.tag?.trim()) params.set("tag", input.tag.trim());
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.offset !== undefined) params.set("offset", String(input.offset));

  const qs = params.toString();
  return apiFetch<PolymarketMarketSearchResponse>(
    `/api/v1/canvas/polymarket/markets${qs ? `?${qs}` : ""}`,
  );
}

export async function getPolymarketMarket(id: string): Promise<{ market: PolymarketDiscoveryMarket }> {
  return apiFetch<{ market: PolymarketDiscoveryMarket }>(
    `/api/v1/canvas/polymarket/markets/${encodeURIComponent(id)}`,
  );
}

export function assetIdForOutcome(
  market: Pick<PolymarketDiscoveryMarket, "clob_token_ids">,
  outcome: string,
): string {
  const tokens = market.clob_token_ids;
  if (tokens.length === 0) return "";
  const idx = outcome === "no" ? 1 : 0;
  return tokens[idx] ?? tokens[0] ?? "";
}

export function marketSelectionValues(
  market: PolymarketDiscoveryMarket,
  outcome: string,
): Record<string, string> {
  const yesToken = market.clob_token_ids[0] ?? "";
  const noToken = market.clob_token_ids[1] ?? "";
  return {
    market: market.question,
    market_id: market.id,
    market_slug: market.slug,
    event_title: market.event_title ?? "",
    yes_token_id: yesToken,
    no_token_id: noToken,
    asset_id: assetIdForOutcome(market, outcome),
  };
}
