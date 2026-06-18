import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getNotificationObservabilitySnapshot } from "../../../src/services/notifications/notification-observability.service.js";

describe("notification observability snapshot", () => {
  it("returns delivery metrics and stale subscription count", async () => {
    const snapshot = await getNotificationObservabilitySnapshot();

    assert.equal(snapshot.window_hours, 24);
    assert.ok(Array.isArray(snapshot.delivery));
    assert.ok(typeof snapshot.stale_push_subscriptions === "number");
    assert.ok(snapshot.captured_at.length > 0);
  });
});
