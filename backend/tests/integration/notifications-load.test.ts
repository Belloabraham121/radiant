import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import { deliverNotification } from "../../src/services/notifications/notification-delivery.service.js";
import { resetNotificationStreamForTests } from "../../src/services/notifications/notification-stream.service.js";

const privyUserId = "did:privy:notification-load-test";
const BURST_SIZE = 40;

describe("notification emit load", () => {
  let userId: bigint;

  before(async () => {
    await prisma.notificationDelivery.deleteMany({
      where: { event: { user: { privy_user_id: privyUserId } } },
    });
    await prisma.notificationEvent.deleteMany({
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
        email: "notification-load-test@radiant.dev",
        ...defaultUserProfileFields(),
        notification_preference: {
          create: {
            enabled: true,
            timezone: "UTC",
            max_per_hour: 1000,
            default_channels: ["in_app"],
          },
        },
      },
    });
    userId = user.id;
  });

  after(async () => {
    await resetNotificationStreamForTests();
    await prisma.notificationDelivery.deleteMany({
      where: { event: { user: { privy_user_id: privyUserId } } },
    });
    await prisma.notificationEvent.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.notificationPreference.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: privyUserId },
    });
  });

  it("delivers a burst of parallel emits with unique idempotency keys", async () => {
    const results = await Promise.all(
      Array.from({ length: BURST_SIZE }, (_, index) =>
        deliverNotification({
          userId,
          notificationType: "radiant.platform.agent_message",
          title: `Burst ${index}`,
          body: "Load test",
          idempotencyKey: `load-test-${index}`,
          channels: ["in_app"],
        }),
      ),
    );

    const delivered = results.filter((result) => result.status === "delivered");
    assert.equal(delivered.length, BURST_SIZE);

    const eventCount = await prisma.notificationEvent.count({
      where: { user_id: userId },
    });
    assert.equal(eventCount, BURST_SIZE);
  });

  it("deduplicates concurrent emits with the same idempotency key", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        deliverNotification({
          userId,
          notificationType: "radiant.platform.agent_message",
          title: "Duplicate burst",
          body: "Same key",
          idempotencyKey: "load-test-duplicate-key",
          channels: ["in_app"],
        }),
      ),
    );

    const delivered = results.filter((result) => result.status === "delivered");
    const duplicates = results.filter((result) => result.status === "duplicate");
    assert.equal(delivered.length + duplicates.length, 10);
    assert.ok(delivered.length >= 1);

    const eventCount = await prisma.notificationEvent.count({
      where: { user_id: userId, idempotency_key: "load-test-duplicate-key" },
    });
    assert.equal(eventCount, 1);
  });
});
