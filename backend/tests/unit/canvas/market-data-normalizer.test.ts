import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  normalizePmBestBidAskMessage,
  normalizePmBookMessage,
  normalizePmTradeMessage,
} from "../../../src/services/canvas/market-data/normalize/event-normalizer.js";
import {
  clearMarketDataStreamsForTests,
  ingestPolymarketWsPayload,
  readLatestPmBookEvent,
} from "../../../src/services/canvas/market-data/market-data.service.js";
import { clearBookSnapshotsForTests } from "../../../src/services/canvas/market-data/cache/book-snapshot-cache.js";

describe("market-data event normalizer", () => {
  afterEach(() => {
    clearMarketDataStreamsForTests();
    clearBookSnapshotsForTests();
  });

  it("normalizes Polymarket book payloads", () => {
    const event = normalizePmBookMessage("asset-1", {
      event_type: "book",
      bids: [{ price: "0.61", size: "1200" }],
      asks: [{ price: "0.63", size: "900" }],
    });
    assert.ok(event);
    assert.equal(event.asset_id, "asset-1");
    assert.equal(event.best_bid, 0.61);
    assert.equal(event.best_ask, 0.63);
    assert.equal(event.mid, 0.62);
  });

  it("normalizes Polymarket trade payloads", () => {
    const event = normalizePmTradeMessage("asset-1", {
      event_type: "last_trade_price",
      price: "0.55",
      size: "250",
      side: "buy",
    });
    assert.ok(event);
    assert.equal(event.price, 0.55);
    assert.equal(event.side, "buy");
  });

  it("ingests WS payload into stream snapshot", async () => {
    await ingestPolymarketWsPayload("asset-42", {
      event_type: "book",
      bids: [{ price: "0.40", size: "500" }],
      asks: [{ price: "0.42", size: "400" }],
    });

    const latest = await readLatestPmBookEvent("asset-42");
    assert.ok(latest);
    assert.equal(latest.asset_id, "asset-42");
    assert.equal(latest.bids[0]?.price, 0.4);
  });

  it("normalizes best_bid_ask payloads", () => {
    const event = normalizePmBestBidAskMessage("asset-1", {
      event_type: "best_bid_ask",
      best_bid: "0.73",
      best_ask: "0.77",
      spread: "0.04",
    });
    assert.ok(event);
    assert.equal(event.best_bid, 0.73);
    assert.equal(event.best_ask, 0.77);
    assert.equal(event.event_type, "best_bid_ask");
  });

  it("ingests price_change payloads with multiple assets", async () => {
    await ingestPolymarketWsPayload("", {
      event_type: "price_change",
      price_changes: [
        {
          asset_id: "asset-a",
          best_bid: "0.5",
          best_ask: "0.52",
        },
        {
          asset_id: "asset-b",
          best_bid: "0.3",
          best_ask: "0.35",
        },
      ],
    });

    const a = await readLatestPmBookEvent("asset-a");
    const b = await readLatestPmBookEvent("asset-b");
    assert.ok(a);
    assert.ok(b);
    assert.equal(a.best_bid, 0.5);
    assert.equal(b.best_ask, 0.35);
  });
});
