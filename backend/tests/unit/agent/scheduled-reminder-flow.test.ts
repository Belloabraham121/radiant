import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractScheduledReminderIntent,
  hasSuccessfulCreateReminderRule,
} from "../../../src/services/agent/notifications/scheduled-reminder-flow.js";
import { CREATE_NOTIFICATION_RULE_TOOL_NAME } from "../../../src/services/notifications/notification-rules.tool.js";

describe("scheduled reminder flow", () => {
  it("extracts relative reminder intent with message", () => {
    const intent = extractScheduledReminderIntent("Remind me in 30 seconds to test push");
    assert.ok(intent);
    assert.equal(intent.in_seconds, 30);
    assert.equal(intent.message, "test push");
    assert.equal(intent.label, "test push");
  });

  it("extracts minute-based reminders", () => {
    const intent = extractScheduledReminderIntent("remind me in 5 minutes about rebalance");
    assert.ok(intent);
    assert.equal(intent.in_seconds, 300);
    assert.equal(intent.message, "rebalance");
  });

  it("returns null for reminder management questions", () => {
    assert.equal(extractScheduledReminderIntent("list my reminders"), null);
    assert.equal(extractScheduledReminderIntent("how do I set a reminder?"), null);
  });

  it("detects successful create_notification_rule tool calls", () => {
    assert.equal(
      hasSuccessfulCreateReminderRule([
        {
          name: CREATE_NOTIFICATION_RULE_TOOL_NAME,
          result: { id: "rule-123" },
        },
      ]),
      true,
    );
    assert.equal(
      hasSuccessfulCreateReminderRule([
        {
          name: CREATE_NOTIFICATION_RULE_TOOL_NAME,
          result: { error: { code: "X", message: "fail" } },
        },
      ]),
      false,
    );
  });
});
