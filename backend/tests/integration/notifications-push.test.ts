import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import {
  listPushSubscriptionsForUser,
  subscribeWebPushForUser,
  unsubscribeWebPushForUser,
} from "../../src/services/notifications/notification-push-subscription.service.js";
import { resetVapidConfigForTests } from "../../src/config/vapid.js";

const privyUserId = "did:privy:notification-push-test";

describe("notification push subscriptions", () => {
  before(async () => {
    process.env.VAPID_PUBLIC_KEY = "test-public-key";
    process.env.VAPID_PRIVATE_KEY = "test-private-key";
    resetVapidConfigForTests();

    await prisma.notificationPushSubscription.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: privyUserId },
    });

    await prisma.user.create({
      data: {
        privy_user_id: privyUserId,
        email: "notification-push-test@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });
  });

  after(async () => {
    resetVapidConfigForTests();
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    await prisma.notificationPushSubscription.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: privyUserId },
    });
  });

  it("creates, lists, and revokes push subscriptions", async () => {
    const created = await subscribeWebPushForUser(privyUserId, {
      endpoint: "https://push.example.test/subscription/1",
      keys: {
        p256dh: "test-p256dh",
        auth: "test-auth",
      },
      user_agent: "test-agent",
    });

    assert.ok(created.id);
    assert.equal(created.endpoint, "https://push.example.test/subscription/1");

    const listed = await listPushSubscriptionsForUser(privyUserId);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, created.id);

    const revoked = await unsubscribeWebPushForUser(privyUserId, created.id);
    assert.equal(revoked.revoked, true);

    const afterRevoke = await listPushSubscriptionsForUser(privyUserId);
    assert.equal(afterRevoke.length, 0);
  });
});
