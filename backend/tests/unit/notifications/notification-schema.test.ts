import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateNotificationCondition } from "../../../src/services/notifications/notification-condition.validator.js";
import {
  buildProjectNotificationSchemaResponse,
  formatNotificationTypeKey,
  notificationScheduleSchema,
  parseNotificationTypeKey,
  parseStoredProjectNotificationSchema,
  projectNotificationSchemaSchema,
  validateNotificationRuleDraft,
  validateNotificationSchedule,
  validateRuleConditionForType,
} from "../../../src/services/notifications/notification-schema.service.js";
import {
  formatPlatformNotificationType,
  getPlatformNotificationType,
  isPlatformNotificationType,
  listPlatformNotificationTypes,
} from "../../../src/services/notifications/platform-notification-registry.js";
import { PROJECT_NOTIFICATION_SCHEMA_VERSION } from "../../../src/services/notifications/notification-schema.types.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

const FLASH_ARB_SCHEMA = {
  schema_version: PROJECT_NOTIFICATION_SCHEMA_VERSION,
  app_id: PROJECT_ID,
  types: [
    {
      type: "opportunity_found",
      label: "Flash loan opportunity",
      description: "Alert when a profitable flash loan path is detected",
      trigger_kind: "poll" as const,
      poll_interval_seconds: 15,
      evaluator: "deepbook.flash_loan_scanner",
      default_channels: ["in_app", "web_push"] as const,
      condition_schema: [
        { name: "min_profit_bps", type: "number" as const, required: true },
        { name: "pool_keys", type: "array" as const },
      ],
    },
  ],
};

describe("notification schema", () => {
  it("parses and formats app notification type keys", () => {
    const key = formatNotificationTypeKey("flash-arb-dashboard", "opportunity_found");
    assert.equal(key, "flash-arb-dashboard.opportunity_found");

    const parsed = parseNotificationTypeKey(key);
    assert.ok(parsed);
    assert.equal(parsed.scope, "app");
    if (parsed.scope === "app") {
      assert.equal(parsed.app_id, "flash-arb-dashboard");
      assert.equal(parsed.type, "opportunity_found");
    }

    assert.equal(parseNotificationTypeKey("invalid"), null);
    assert.equal(parseNotificationTypeKey("app.BAD_TYPE"), null);
  });

  it("parses platform notification type keys", () => {
    const key = formatPlatformNotificationType("agent_message");
    assert.equal(key, "radiant.platform.agent_message");
    assert.equal(isPlatformNotificationType(key), true);

    const parsed = parseNotificationTypeKey(key);
    assert.ok(parsed);
    assert.equal(parsed.scope, "platform");
    if (parsed.scope === "platform") {
      assert.equal(parsed.platform_type, "agent_message");
    }
  });

  it("lists platform notification types from registry", () => {
    const types = listPlatformNotificationTypes();
    assert.ok(types.length >= 2);
    assert.ok(types.some((entry) => entry.type === "agent_message"));
    assert.ok(types.some((entry) => entry.type === "system_announcement"));

    const agentType = getPlatformNotificationType("radiant.platform.agent_message");
    assert.ok(agentType);
    assert.equal(agentType?.trigger_kind, "event");
  });

  it("validates stored project notification schema", () => {
    const parsed = parseStoredProjectNotificationSchema(FLASH_ARB_SCHEMA);
    assert.ok(parsed);
    assert.equal(parsed?.app_id, PROJECT_ID);
    assert.equal(parsed?.types.length, 1);

    const invalid = parseStoredProjectNotificationSchema({ schema_version: 2, app_id: "x", types: [] });
    assert.equal(invalid, null);

    const zodParsed = projectNotificationSchemaSchema.safeParse(FLASH_ARB_SCHEMA);
    assert.equal(zodParsed.success, true);
  });

  it("buildProjectNotificationSchemaResponse returns stored schema", () => {
    const response = buildProjectNotificationSchemaResponse({
      id: PROJECT_ID,
      notification_schema: FLASH_ARB_SCHEMA,
    });
    assert.ok(response);
    assert.equal(response?.types[0]?.evaluator, "deepbook.flash_loan_scanner");
  });

  it("validates rule condition against type condition_schema", () => {
    const project = { id: PROJECT_ID, notification_schema: FLASH_ARB_SCHEMA };
    const notificationType = formatNotificationTypeKey(PROJECT_ID, "opportunity_found");

    const ok = validateRuleConditionForType({
      notification_type: notificationType,
      condition: { min_profit_bps: 50, pool_keys: ["SUI_USDC"] },
      project,
    });
    assert.equal(ok.success, true);
    if (ok.success) {
      assert.equal(ok.data.min_profit_bps, 50);
    }

    const missingRequired = validateRuleConditionForType({
      notification_type: notificationType,
      condition: { pool_keys: ["SUI_USDC"] },
      project,
    });
    assert.equal(missingRequired.success, false);

    const unknownType = validateRuleConditionForType({
      notification_type: "unknown-app.unknown_type",
      condition: {},
      project,
    });
    assert.equal(unknownType.success, false);
  });

  it("validateNotificationCondition enforces field types", () => {
    const fields = [
      { name: "min_profit_bps", type: "number" as const, required: true },
      { name: "enabled", type: "boolean" as const },
    ];

    const ok = validateNotificationCondition({ min_profit_bps: 25, enabled: true }, fields);
    assert.equal(ok.success, true);

    const badType = validateNotificationCondition({ min_profit_bps: "50" }, fields);
    assert.equal(badType.success, false);
  });

  it("validates schedule shapes", () => {
    const once = validateNotificationSchedule({
      kind: "once",
      at: "2026-06-18T15:00:00.000Z",
    });
    assert.equal(once.success, true);

    const cron = validateNotificationSchedule({
      kind: "cron",
      expression: "0 9 * * *",
      timezone: "America/New_York",
    });
    assert.equal(cron.success, true);

    const interval = validateNotificationSchedule({
      kind: "interval",
      every_seconds: 3600,
    });
    assert.equal(interval.success, true);

    const bad = validateNotificationSchedule({ kind: "once", at: "not-a-date" });
    assert.equal(bad.success, false);

    const union = notificationScheduleSchema.safeParse({
      kind: "cron",
      expression: "0 9 * * *",
      timezone: "UTC",
    });
    assert.equal(union.success, true);
  });

  it("validateNotificationRuleDraft enforces trigger_kind and schedule rules", () => {
    const project = { id: PROJECT_ID, notification_schema: FLASH_ARB_SCHEMA };
    const notificationType = formatNotificationTypeKey(PROJECT_ID, "opportunity_found");

    const pollOk = validateNotificationRuleDraft({
      notification_type: notificationType,
      trigger_kind: "poll",
      condition: { min_profit_bps: 50 },
      project,
    });
    assert.equal(pollOk.success, true);

    const pollWithSchedule = validateNotificationRuleDraft({
      notification_type: notificationType,
      trigger_kind: "poll",
      condition: { min_profit_bps: 50 },
      schedule: { kind: "once", at: "2026-06-18T15:00:00.000Z" },
      project,
    });
    assert.equal(pollWithSchedule.success, false);

    const scheduleType = {
      ...FLASH_ARB_SCHEMA,
      types: [
        {
          ...FLASH_ARB_SCHEMA.types[0]!,
          type: "daily_reminder",
          trigger_kind: "schedule" as const,
        },
      ],
    };
    const scheduleProject = { id: PROJECT_ID, notification_schema: scheduleType };
    const scheduleNotificationType = formatNotificationTypeKey(PROJECT_ID, "daily_reminder");

    const scheduleMissing = validateNotificationRuleDraft({
      notification_type: scheduleNotificationType,
      trigger_kind: "schedule",
      condition: { min_profit_bps: 50 },
      project: scheduleProject,
    });
    assert.equal(scheduleMissing.success, false);

    const scheduleOk = validateNotificationRuleDraft({
      notification_type: scheduleNotificationType,
      trigger_kind: "schedule",
      condition: { min_profit_bps: 50 },
      schedule: { kind: "once", at: "2026-06-18T15:00:00.000Z" },
      project: scheduleProject,
    });
    assert.equal(scheduleOk.success, true);
  });

  it("validates platform notification rule conditions", () => {
    const platformOk = validateNotificationRuleDraft({
      notification_type: "radiant.platform.agent_message",
      trigger_kind: "event",
      condition: { session_id: "22222222-2222-4222-8222-222222222222" },
    });
    assert.equal(platformOk.success, true);

    const platformDraft = validateRuleConditionForType({
      notification_type: "radiant.platform.system_announcement",
      condition: {},
    });
    assert.equal(platformDraft.success, true);
  });
});
