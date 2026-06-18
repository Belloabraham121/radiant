import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { exportUserDataForPrivyUser } from "../../src/services/auth/user-data-export.service.js";
import { deleteUserAccountByPrivyId } from "../../src/services/auth/user-deletion.service.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import { deliverNotification } from "../../src/services/notifications/notification-delivery.service.js";
import { createNotificationRuleForUser } from "../../src/services/notifications/notification-rule.service.js";
import { resetNotificationStreamForTests } from "../../src/services/notifications/notification-stream.service.js";

const privyUserId = "did:privy:notification-user-data-test";

describe("notification user data export and deletion", () => {
  let userId: bigint;
  let ruleId: string;

  before(async () => {
    await prisma.notificationDelivery.deleteMany({
      where: { event: { user: { privy_user_id: privyUserId } } },
    });
    await prisma.notificationEvent.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.notificationRule.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.notificationPreference.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: privyUserId },
    });

    const user = await prisma.user.create({
      data: {
        privy_user_id: privyUserId,
        email: "notification-user-data-test@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });
    userId = user.id;

    const rule = await createNotificationRuleForUser(
      privyUserId,
      {},
      {
        notification_type: "radiant.platform.agent_message",
        condition: {},
        channels: ["in_app", "email"],
        label: "Export test rule",
      },
      { source: "user" },
    );
    ruleId = rule.id;

    await deliverNotification({
      userId,
      ruleId,
      notificationType: "radiant.platform.agent_message",
      title: "Export me",
      body: "Included in GDPR export",
      idempotencyKey: "user-data-export-event",
      channels: ["in_app", "email"],
    });
  });

  after(async () => {
    await resetNotificationStreamForTests();
    await prisma.notificationDelivery.deleteMany({
      where: { event: { user: { privy_user_id: privyUserId } } },
    });
    await prisma.notificationEvent.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.notificationRule.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.notificationPreference.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: privyUserId },
    });
  });

  it("exports notification rules and events for the signed-in user", async () => {
    const exported = await exportUserDataForPrivyUser(privyUserId);

    assert.equal(exported.privy_user_id, privyUserId);
    assert.ok(exported.notifications.preferences);
    assert.equal(exported.notifications.rules.length, 1);
    assert.equal(exported.notifications.rules[0]?.id, ruleId);
    assert.equal(exported.notifications.events.length, 1);
    assert.equal(exported.notifications.events[0]?.title, "Export me");
    assert.ok(
      exported.notifications.events[0]?.deliveries.some((delivery) => delivery.channel === "email"),
    );
  });

  it("deletes notification data when the account is removed", async () => {
    const result = await deleteUserAccountByPrivyId(privyUserId);
    assert.equal(result.deleted, true);

    const remainingEvents = await prisma.notificationEvent.count({
      where: { user_id: userId },
    });
    const remainingRules = await prisma.notificationRule.count({
      where: { user_id: userId },
    });

    assert.equal(remainingEvents, 0);
    assert.equal(remainingRules, 0);
  });
});
