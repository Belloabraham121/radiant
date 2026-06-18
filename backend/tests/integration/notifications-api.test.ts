import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import { PROJECT_NOTIFICATION_SCHEMA_VERSION } from "../../src/services/notifications/notification-schema.types.js";
import {
  createNotificationRuleForUser,
  deleteNotificationRuleForUser,
  getProjectNotificationSchemaForUser,
  listNotificationRulesForUser,
  updateNotificationRuleForUser,
} from "../../src/services/notifications/notification-rule.service.js";
import {
  getNotificationPreferencesForUser,
  patchNotificationPreferencesForUser,
} from "../../src/services/notifications/notification-preference.service.js";
import { runCreateNotificationRuleTool } from "../../src/services/notifications/notification-rules.tool.js";

const privyUserId = "did:privy:notification-rules-test";
const otherPrivyUserId = "did:privy:notification-rules-other";

const NOTIFICATION_SCHEMA = {
  schema_version: PROJECT_NOTIFICATION_SCHEMA_VERSION,
  app_id: "",
  types: [
    {
      type: "opportunity_found",
      label: "Flash loan opportunity",
      description: "Alert when profitable path detected",
      trigger_kind: "poll" as const,
      evaluator: "deepbook.flash_loan_scanner",
      default_channels: ["in_app", "web_push"] as const,
      condition_schema: [{ name: "min_profit_bps", type: "number" as const, required: true }],
    },
    {
      type: "daily_reminder",
      label: "Daily reminder",
      description: "Scheduled reminder",
      trigger_kind: "schedule" as const,
      default_channels: ["in_app"] as const,
      condition_schema: [],
    },
  ],
};

describe("notification rules service", () => {
  let userId: bigint;
  let otherUserId: bigint;
  let projectId: string;
  let otherProjectId: string;

  before(async () => {
    await prisma.notificationDelivery.deleteMany({
      where: { event: { user: { privy_user_id: { in: [privyUserId, otherPrivyUserId] } } } },
    });
    await prisma.notificationEvent.deleteMany({
      where: { user: { privy_user_id: { in: [privyUserId, otherPrivyUserId] } } },
    });
    await prisma.notificationRule.deleteMany({
      where: { user: { privy_user_id: { in: [privyUserId, otherPrivyUserId] } } },
    });
    await prisma.notificationPreference.deleteMany({
      where: { user: { privy_user_id: { in: [privyUserId, otherPrivyUserId] } } },
    });
    await prisma.project.deleteMany({
      where: { user: { privy_user_id: { in: [privyUserId, otherPrivyUserId] } } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: { in: [privyUserId, otherPrivyUserId] } },
    });

    const user = await prisma.user.create({
      data: {
        privy_user_id: privyUserId,
        email: "notification-rules-test@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });
    const otherUser = await prisma.user.create({
      data: {
        privy_user_id: otherPrivyUserId,
        email: "notification-rules-other@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });
    userId = user.id;
    otherUserId = otherUser.id;

    const project = await prisma.project.create({
      data: {
        user_id: userId,
        name: "Flash Arb",
        template: "custom",
        notification_schema: {
          ...NOTIFICATION_SCHEMA,
          app_id: "placeholder",
        },
      },
    });
    projectId = project.id;

    await prisma.project.update({
      where: { id: projectId },
      data: {
        notification_schema: {
          ...NOTIFICATION_SCHEMA,
          app_id: projectId,
        },
      },
    });

    const otherProject = await prisma.project.create({
      data: {
        user_id: otherUserId,
        name: "Other App",
        template: "custom",
      },
    });
    otherProjectId = otherProject.id;
  });

  after(async () => {
    await prisma.notificationDelivery.deleteMany({
      where: { event: { user: { privy_user_id: { in: [privyUserId, otherPrivyUserId] } } } },
    });
    await prisma.notificationEvent.deleteMany({
      where: { user: { privy_user_id: { in: [privyUserId, otherPrivyUserId] } } },
    });
    await prisma.notificationRule.deleteMany({
      where: { user: { privy_user_id: { in: [privyUserId, otherPrivyUserId] } } },
    });
    await prisma.notificationPreference.deleteMany({
      where: { user: { privy_user_id: { in: [privyUserId, otherPrivyUserId] } } },
    });
    await prisma.project.deleteMany({
      where: { user: { privy_user_id: { in: [privyUserId, otherPrivyUserId] } } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: { in: [privyUserId, otherPrivyUserId] } },
    });
    await prisma.$disconnect();
  });

  it("creates, lists, updates, and deletes project-scoped rules", async () => {
    const created = await createNotificationRuleForUser(
      privyUserId,
      { projectId },
      {
        notification_type: "opportunity_found",
        condition: { min_profit_bps: 50 },
        label: "SUI arb alerts",
      },
      { source: "user" },
    );

    assert.equal(created.project_id, projectId);
    assert.equal(created.notification_type, `${projectId}.opportunity_found`);
    assert.equal(created.status, "active");

    const listed = await listNotificationRulesForUser(privyUserId, { project_id: projectId });
    assert.equal(listed.total, 1);
    assert.equal(listed.rules[0]?.id, created.id);

    const paused = await updateNotificationRuleForUser(privyUserId, created.id, {
      status: "paused",
      condition: { min_profit_bps: 75 },
    });
    assert.equal(paused.status, "paused");
    assert.equal(paused.condition.min_profit_bps, 75);

    const deleted = await deleteNotificationRuleForUser(privyUserId, created.id);
    assert.equal(deleted.status, "deleted");

    const afterDelete = await listNotificationRulesForUser(privyUserId, { project_id: projectId });
    assert.equal(afterDelete.total, 0);
  });

  it("creates platform notification rules without project scope", async () => {
    const created = await createNotificationRuleForUser(
      privyUserId,
      {},
      {
        notification_type: "radiant.platform.agent_message",
        condition: {},
      },
      { source: "user" },
    );

    assert.equal(created.project_id, null);
    assert.equal(created.notification_type, "radiant.platform.agent_message");
  });

  it("returns project notification schema for owner", async () => {
    const schema = await getProjectNotificationSchemaForUser(privyUserId, projectId);
    assert.ok(schema);
    assert.equal(schema?.app_id, projectId);
    assert.ok(schema?.types.some((entry) => entry.type === "opportunity_found"));
  });

  it("isolates rules by user and project ownership", async () => {
    await assert.rejects(
      () =>
        createNotificationRuleForUser(
          privyUserId,
          { projectId: otherProjectId },
          {
            notification_type: "opportunity_found",
            condition: { min_profit_bps: 10 },
          },
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Project not found/);
        return true;
      },
    );
  });

  it("agent tool applies pinned project scope", async () => {
    const created = await runCreateNotificationRuleTool(
      privyUserId,
      {
        notification_type: "opportunity_found",
        condition: { min_profit_bps: 25 },
      },
      {
        pinnedAppScope: {
          kind: "project",
          project_id: projectId,
          name: "Flash Arb",
        },
      },
    );

    assert.equal(created.project_id, projectId);
    assert.equal(created.source, "agent");
  });

  it("manages notification preferences", async () => {
    const defaults = await getNotificationPreferencesForUser(privyUserId);
    assert.equal(defaults.enabled, true);
    assert.deepEqual(defaults.default_channels, ["in_app", "web_push"]);

    const patched = await patchNotificationPreferencesForUser(privyUserId, {
      quiet_hours_start: "22:00",
      quiet_hours_end: "08:00",
      max_per_hour: 5,
    });
    assert.equal(patched.quiet_hours_start, "22:00");
    assert.equal(patched.max_per_hour, 5);
  });
});
