import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NotificationPreference, NotificationRule } from "@prisma/client";
import {
  evaluateNotificationDeliveryPolicy,
  isRuleCooldownActive,
  isWithinQuietHours,
} from "../../src/services/notifications/notification-delivery-policy.service.js";

function basePreference(overrides: Partial<NotificationPreference> = {}): NotificationPreference {
  return {
    user_id: 1n,
    enabled: true,
    timezone: "UTC",
    quiet_hours_start: null,
    quiet_hours_end: null,
    max_per_hour: 10,
    default_channels: ["in_app"],
    updated_at: new Date(),
    ...overrides,
  };
}

function baseRule(overrides: Partial<NotificationRule> = {}): NotificationRule {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    user_id: 1n,
    project_id: null,
    installation_id: null,
    source: "user",
    session_id: null,
    label: null,
    notification_type: "radiant.platform.agent_message",
    trigger_kind: "event",
    condition: {},
    schedule: null,
    channels: ["in_app"],
    status: "active",
    cooldown_seconds: 300,
    trigger_once: false,
    last_triggered_at: null,
    expires_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe("notification delivery policy", () => {
  it("blocks delivery when preferences are disabled", () => {
    const result = evaluateNotificationDeliveryPolicy({
      now: new Date("2026-06-18T12:00:00.000Z"),
      preferences: basePreference({ enabled: false }),
      eventsInLastHour: 0,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.skipReason, "disabled");
  });

  it("blocks delivery when rule is paused", () => {
    const result = evaluateNotificationDeliveryPolicy({
      now: new Date("2026-06-18T12:00:00.000Z"),
      preferences: basePreference(),
      rule: baseRule({ status: "paused" }),
      eventsInLastHour: 0,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.skipReason, "paused_rule");
  });

  it("blocks delivery during quiet hours (overnight window)", () => {
    const result = evaluateNotificationDeliveryPolicy({
      now: new Date("2026-06-18T23:30:00.000Z"),
      preferences: basePreference({
        quiet_hours_start: "22:00",
        quiet_hours_end: "08:00",
      }),
      eventsInLastHour: 0,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.skipReason, "quiet_hours");
  });

  it("allows delivery outside quiet hours", () => {
    assert.equal(
      isWithinQuietHours({
        now: new Date("2026-06-18T12:00:00.000Z"),
        timezone: "UTC",
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
      }),
      false,
    );
  });

  it("blocks delivery when hourly rate limit is exceeded", () => {
    const result = evaluateNotificationDeliveryPolicy({
      now: new Date("2026-06-18T12:00:00.000Z"),
      preferences: basePreference({ max_per_hour: 2 }),
      eventsInLastHour: 2,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.skipReason, "rate_limit");
  });

  it("blocks delivery during rule cooldown", () => {
    const now = new Date("2026-06-18T12:00:00.000Z");
    const rule = baseRule({
      cooldown_seconds: 600,
      last_triggered_at: new Date("2026-06-18T11:55:00.000Z"),
    });

    assert.equal(isRuleCooldownActive(rule, now), true);

    const result = evaluateNotificationDeliveryPolicy({
      now,
      preferences: basePreference(),
      rule,
      eventsInLastHour: 0,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.skipReason, "cooldown");
  });

  it("allows delivery when cooldown has elapsed", () => {
    const now = new Date("2026-06-18T12:00:00.000Z");
    const rule = baseRule({
      cooldown_seconds: 300,
      last_triggered_at: new Date("2026-06-18T11:00:00.000Z"),
    });

    const result = evaluateNotificationDeliveryPolicy({
      now,
      preferences: basePreference(),
      rule,
      eventsInLastHour: 0,
    });
    assert.equal(result.allowed, true);
  });
});
