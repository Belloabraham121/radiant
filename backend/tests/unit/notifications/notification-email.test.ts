import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deliverEmailNotification } from "../../../src/services/notifications/notification-email.service.js";

describe("notification email channel stub", () => {
  it("returns a skipped result for email delivery", async () => {
    const result = await deliverEmailNotification({
      userId: 1n,
      event: {
        id: "00000000-0000-4000-8000-000000000001",
        user_id: 1n,
        rule_id: null,
        project_id: null,
        installation_id: null,
        notification_type: "radiant.platform.agent_message",
        title: "Email test",
        body: "Body",
        payload: {},
        idempotency_key: null,
        created_at: new Date(),
      },
      payload: {},
    });

    assert.equal(result.status, "skipped");
    if (result.status === "skipped") {
      assert.equal(result.reason, "email_channel_not_implemented");
    }
  });
});
