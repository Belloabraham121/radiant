import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  gammaGetMarketById,
  gammaListMarkets,
  gammaPublicSearchMarkets,
  resetPolymarketGammaClientForTests,
  setPolymarketGammaFetchForTests,
} from "../../../src/services/canvas/adapters/polymarket/polymarket-gamma.client.js";
import {
  filterWorldCupMarkets,
  getPolymarketMarketById,
  recommendedYesAssetId,
  searchPolymarketMarkets,
} from "../../../src/services/canvas/adapters/polymarket/polymarket-market-discovery.service.js";
import type { PolymarketDiscoveryMarket } from "../../../src/services/canvas/adapters/polymarket/polymarket-gamma.types.js";

const SAMPLE_MARKET = {
  id: "123",
  slug: "will-it-rain",
  question: "Will it rain tomorrow?",
  outcomes: "[\"Yes\", \"No\"]",
  clobTokenIds: "[\"token-yes\", \"token-no\"]",
  active: true,
  closed: false,
  tags: [{ slug: "politics", label: "Politics" }],
};

const SAMPLE_EVENT = {
  title: "Weather",
  tags: [{ slug: "politics", label: "Politics" }],
  markets: [SAMPLE_MARKET],
};

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  setPolymarketGammaFetchForTests((input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url);
  });
}

describe("polymarket gamma client", () => {
  afterEach(() => {
    resetPolymarketGammaClientForTests();
  });

  it("normalizes public-search markets with parsed token ids", async () => {
    mockFetch((url) => {
      assert.match(url, /\/public-search\?/);
      assert.match(url, /q=rain/);
      return Response.json({
        events: [SAMPLE_EVENT],
        pagination: { hasMore: false, totalResults: 1 },
      });
    });

    const result = await gammaPublicSearchMarkets({
      q: "rain",
      limit: 10,
      offset: 0,
    });

    assert.equal(result.markets.length, 1);
    assert.equal(result.markets[0]?.question, "Will it rain tomorrow?");
    assert.deepEqual(result.markets[0]?.outcomes, ["Yes", "No"]);
    assert.deepEqual(result.markets[0]?.clob_token_ids, ["token-yes", "token-no"]);
    assert.equal(result.markets[0]?.event_title, "Weather");
    assert.equal(result.markets[0]?.category, "politics");
  });

  it("lists markets by tag slug", async () => {
    mockFetch((url) => {
      assert.match(url, /\/markets\?/);
      assert.match(url, /tag_slug=sports/);
      return Response.json([SAMPLE_MARKET]);
    });

    const result = await gammaListMarkets({ tagSlug: "sports", limit: 5, offset: 0 });
    assert.equal(result.markets.length, 1);
    assert.equal(result.markets[0]?.slug, "will-it-rain");
  });

  it("loads a single market by id", async () => {
    mockFetch((url) => {
      assert.match(url, /\/markets\/123$/);
      return Response.json(SAMPLE_MARKET);
    });

    const market = await gammaGetMarketById("123");
    assert.ok(market);
    assert.equal(market?.id, "123");
  });
});

describe("polymarket market discovery service", () => {
  afterEach(() => {
    resetPolymarketGammaClientForTests();
  });

  it("searches by query text", async () => {
    mockFetch(() =>
      Response.json({
        events: [SAMPLE_EVENT],
        pagination: { hasMore: false, totalResults: 1 },
      }),
    );

    const result = await searchPolymarketMarkets({ q: "rain", limit: 10 });
    assert.equal(result.markets.length, 1);
    assert.equal(result.markets[0]?.clob_token_ids[0], "token-yes");
  });

  it("browses by category when no query is provided", async () => {
    mockFetch((url) => {
      assert.match(url, /tag_slug=sports/);
      return Response.json([SAMPLE_MARKET]);
    });

    const result = await searchPolymarketMarkets({ category: "sports", limit: 5 });
    assert.equal(result.markets.length, 1);
  });

  it("loads market detail by id", async () => {
    mockFetch((url) => {
      assert.match(url, /\/markets\/123$/);
      return Response.json(SAMPLE_MARKET);
    });

    const market = await getPolymarketMarketById("123");
    assert.ok(market);
    assert.equal(market?.question, "Will it rain tomorrow?");
  });
});

describe("world cup market search filters", () => {
  const wcMatch: PolymarketDiscoveryMarket = {
    id: "1",
    slug: "fifwc-2026-bra-vs-arg-win",
    question: "Brazil vs Argentina — Brazil win?",
    event_title: "WC R32",
    category: "sports",
    tags: ["sports", "soccer", "fifa-world-cup"],
    outcomes: ["Yes", "No"],
    clob_token_ids: ["yes-bra", "no-bra"],
    active: true,
    closed: false,
  };

  const mentionMarket: PolymarketDiscoveryMarket = {
    id: "2",
    slug: "fifwc-2026-brazil-mention",
    question: "Will Brazil be mentioned?",
    event_title: "WC",
    category: "sports",
    tags: ["mention-markets", "soccer"],
    outcomes: ["Yes", "No"],
    clob_token_ids: ["yes-m", "no-m"],
    active: true,
    closed: false,
  };

  const politicsNoise: PolymarketDiscoveryMarket = {
    id: "3",
    slug: "brazil-presidential-election",
    question: "Brazil presidential election winner?",
    event_title: "Politics",
    category: "politics",
    tags: ["politics"],
    outcomes: ["Yes", "No"],
    clob_token_ids: ["yes-p", "no-p"],
    active: true,
    closed: false,
  };

  it("excludes mention-markets and prefers fifwc slugs for world cup queries", () => {
    const filtered = filterWorldCupMarkets(
      [mentionMarket, politicsNoise, wcMatch],
      "brazil world cup",
      "sports",
      "soccer",
    );
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.slug, wcMatch.slug);
  });

  it("ranks match-winner slugs above generic markets", () => {
    const generic: PolymarketDiscoveryMarket = {
      ...wcMatch,
      id: "4",
      slug: "fifwc-2026-bra-vs-arg-total-goals",
      question: "Total goals over 2.5?",
    };
    const filtered = filterWorldCupMarkets([generic, wcMatch], "fifa world cup");
    assert.equal(filtered[0]?.slug, wcMatch.slug);
  });

  it("recommendedYesAssetId returns first yes token", () => {
    assert.equal(recommendedYesAssetId(wcMatch), "yes-bra");
  });

  it("prefers active open markets over closed when both match fifwc", () => {
    const closedMatch: PolymarketDiscoveryMarket = {
      ...wcMatch,
      id: "5",
      slug: "fifwc-bra-jpn-2026-06-29-bra",
      closed: true,
      active: false,
    };
    const filtered = filterWorldCupMarkets(
      [closedMatch, wcMatch],
      "brazil japan world cup",
      "sports",
      "soccer",
    );
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.slug, wcMatch.slug);
    assert.equal(filtered[0]?.closed, false);
  });

  it("leaves non-world-cup queries unchanged", () => {
    const markets = [politicsNoise, mentionMarket];
    const filtered = filterWorldCupMarkets(markets, "rain tomorrow");
    assert.deepEqual(filtered, markets);
  });
});
