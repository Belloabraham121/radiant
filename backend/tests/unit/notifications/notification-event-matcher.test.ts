import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesNotificationEventCondition } from "../../../src/services/notifications/notification-event-matcher.service.js";

describe("notification event matcher", () => {
  it("matches empty conditions (any event of the type)", () => {
    assert.equal(matchesNotificationEventCondition({}, { foo: "bar" }), true);
  });

  it("matches exact equality filters", () => {
    assert.equal(
      matchesNotificationEventCondition(
        { item_id: "abc", status: "outbid" },
        { item_id: "abc", status: "outbid", bid_usd: 600 },
      ),
      true,
    );
    assert.equal(
      matchesNotificationEventCondition({ item_id: "abc" }, { item_id: "xyz" }),
      false,
    );
  });

  it("matches min_ and max_ numeric thresholds", () => {
    assert.equal(
      matchesNotificationEventCondition(
        { min_profit_bps: 50 },
        { profit_bps: 75, route: "SUI→USDC" },
      ),
      true,
    );
    assert.equal(
      matchesNotificationEventCondition({ min_profit_bps: 50 }, { profit_bps: 25 }),
      false,
    );
    assert.equal(
      matchesNotificationEventCondition({ max_price_usd: 2 }, { price_usd: 1.5 }),
      true,
    );
  });
});
