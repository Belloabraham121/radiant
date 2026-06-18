import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveNotificationDeepLink } from "../../../src/services/notifications/notification-web-push.service.js";

describe("notification web push", () => {
  it("prefers explicit deep_link from payload", () => {
    const url = resolveNotificationDeepLink({
      payload: { deep_link: "/custom/path" },
      projectId: "00000000-0000-4000-8000-000000000001",
      installationId: null,
    });
    assert.equal(url, "/custom/path");
  });

  it("builds installation run deep link", () => {
    const url = resolveNotificationDeepLink({
      payload: {},
      projectId: null,
      installationId: "00000000-0000-4000-8000-000000000002",
    });
    assert.equal(url, "/app/installed/00000000-0000-4000-8000-000000000002/run");
  });

  it("builds project run deep link", () => {
    const url = resolveNotificationDeepLink({
      payload: {},
      projectId: "00000000-0000-4000-8000-000000000003",
      installationId: null,
    });
    assert.equal(url, "/app/projects/00000000-0000-4000-8000-000000000003/run");
  });

  it("falls back to projects hub", () => {
    const url = resolveNotificationDeepLink({
      payload: {},
      projectId: null,
      installationId: null,
    });
    assert.equal(url, "/app/projects");
  });
});
