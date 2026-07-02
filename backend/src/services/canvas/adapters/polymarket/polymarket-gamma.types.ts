/** Normalized Polymarket market record for Canvas discovery. */
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

export type PolymarketMarketSearchResult = {
  markets: PolymarketDiscoveryMarket[];
  total: number;
  has_more: boolean;
};

/** Top-level category presets mapped to Gamma tag_slug values. */
export const POLYMARKET_DISCOVERY_CATEGORIES = {
  sports: "sports",
  politics: "politics",
  crypto: "crypto",
} as const;

export type PolymarketDiscoveryCategory = keyof typeof POLYMARKET_DISCOVERY_CATEGORIES;

/** Common sports league tags exposed in the UI secondary filter. */
export const POLYMARKET_SPORTS_LEAGUE_TAGS = [
  "nfl",
  "nba",
  "mlb",
  "nhl",
  "soccer",
  "ncaa",
  "ufc",
  "golf",
] as const;

export type PolymarketSportsLeagueTag = (typeof POLYMARKET_SPORTS_LEAGUE_TAGS)[number];
