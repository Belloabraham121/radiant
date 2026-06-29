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
  getPolymarketMarketById,
  searchPolymarketMarkets,
} from "../../../src/services/canvas/adapters/polymarket/polymarket-market-discovery.service.js";

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
