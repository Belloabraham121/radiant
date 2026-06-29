import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveNotificationDeepLink } from "../../../src/services/notifications/notification-web-push.service.js";

describe("notification web push", () => {
  it("prefers explicit deep_link from payload", () => {
    const url = resolveNotificationDeepLink({
      payload: { deep_link: "/custom/path" },
    });
    assert.equal(url, "/custom/path");
  });

  it("falls back to chat", () => {
    const url = resolveNotificationDeepLink({
      payload: {},
    });
    assert.equal(url, "/app/chat");
  });
});
