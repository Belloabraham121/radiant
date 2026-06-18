import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { createApp } from "../../src/app.js";
import { resetInngestConfigForTests } from "../../src/config/inngest.js";
import { resetNotificationsConfigForTests } from "../../src/config/notifications.js";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import { deliverNotification } from "../../src/services/notifications/notification-delivery.service.js";
import {
  listNotificationEventsForUser,
  markNotificationEventReadForUser,
} from "../../src/services/notifications/notification-event.service.js";
import { createNotificationRuleForUser } from "../../src/services/notifications/notification-rule.service.js";
import { patchNotificationPreferencesForUser } from "../../src/services/notifications/notification-preference.service.js";
import { resetNotificationStreamForTests } from "../../src/services/notifications/notification-stream.service.js";

const privyUserId = "did:privy:notification-delivery-test";
const internalApiKey = "test-notifications-internal-key";

describe("notification delivery", () => {
  let userId: bigint;
  let ruleId: string;

  before(async () => {
    process.env.NOTIFICATIONS_INTERNAL_API_KEY = internalApiKey;
    resetNotificationsConfigForTests();

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
        email: "notification-delivery-test@radiant.dev",
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
        channels: ["in_app", "web_push"],
      },
      { source: "user" },
    );
    ruleId = rule.id;
  });

  after(async () => {
    await resetNotificationStreamForTests();
  });

  it("delivers in-app notification and skips unsupported channels", async () => {
    const result = await deliverNotification({
      userId,
      ruleId,
      notificationType: "radiant.platform.agent_message",
      title: "Hello",
      body: "World",
      idempotencyKey: "delivery-test-1",
    });

    assert.equal(result.status, "delivered");
    if (result.status !== "delivered") {
      return;
    }

    assert.ok(result.event_id);
    assert.deepEqual(result.skipped_channels, ["web_push"]);

    const inbox = await listNotificationEventsForUser(privyUserId, {});
    assert.equal(inbox.total, 1);
    assert.equal(inbox.events[0]?.unread, true);
    assert.equal(inbox.events[0]?.title, "Hello");
  });

  it("deduplicates by idempotency key", async () => {
    const first = await deliverNotification({
      userId,
      notificationType: "radiant.platform.agent_message",
      title: "Dup",
      body: "Test",
      idempotencyKey: "delivery-test-dup",
    });
    const second = await deliverNotification({
      userId,
      notificationType: "radiant.platform.agent_message",
      title: "Dup",
      body: "Test",
      idempotencyKey: "delivery-test-dup",
    });

    assert.equal(first.status, "delivered");
    assert.equal(second.status, "duplicate");
    if (first.status === "delivered" && second.status === "duplicate") {
      assert.equal(second.event_id, first.event_id);
    }

    const inbox = await listNotificationEventsForUser(privyUserId, {});
    assert.equal(inbox.total, 2);
  });

  it("suppresses delivery when rule is paused", async () => {
    await prisma.notificationRule.update({
      where: { id: ruleId },
      data: { status: "paused" },
    });

    const result = await deliverNotification({
      userId,
      ruleId,
      notificationType: "radiant.platform.agent_message",
      title: "Paused",
      body: "Should not deliver",
      idempotencyKey: "delivery-test-paused",
    });

    assert.equal(result.status, "suppressed");
    assert.equal(result.reason, "paused_rule");

    await prisma.notificationRule.update({
      where: { id: ruleId },
      data: { status: "active" },
    });
  });

  it("suppresses delivery during quiet hours", async () => {
    await patchNotificationPreferencesForUser(privyUserId, {
      quiet_hours_start: "00:00",
      quiet_hours_end: "23:59",
    });

    const result = await deliverNotification({
      userId,
      notificationType: "radiant.platform.agent_message",
      title: "Quiet",
      body: "Should not deliver",
      idempotencyKey: "delivery-test-quiet",
    });

    assert.equal(result.status, "suppressed");
    assert.equal(result.reason, "quiet_hours");

    await patchNotificationPreferencesForUser(privyUserId, {
      quiet_hours_start: null,
      quiet_hours_end: null,
    });
  });

  it("marks notification as read", async () => {
    const delivered = await deliverNotification({
      userId,
      notificationType: "radiant.platform.agent_message",
      title: "Read me",
      body: "Please",
      idempotencyKey: "delivery-test-read",
    });

    assert.equal(delivered.status, "delivered");
    if (delivered.status !== "delivered") {
      return;
    }

    const read = await markNotificationEventReadForUser(privyUserId, delivered.event_id);
    assert.ok(read.read_at);

    const unreadOnly = await listNotificationEventsForUser(privyUserId, { unread: true });
    const readEvent = unreadOnly.events.find((event) => event.id === delivered.event_id);
    assert.equal(readEvent, undefined);
  });
});

describe("internal notification emit API", () => {
  let server: Server;
  let baseUrl: string;
  const savedInngestEnv = {
    dev: process.env.INNGEST_DEV,
    eventKey: process.env.INNGEST_EVENT_KEY,
    signingKey: process.env.INNGEST_SIGNING_KEY,
    deployQueueProvider: process.env.DEPLOY_QUEUE_PROVIDER,
  };

  before(async () => {
    process.env.NOTIFICATIONS_INTERNAL_API_KEY = internalApiKey;
    delete process.env.INNGEST_DEV;
    delete process.env.INNGEST_EVENT_KEY;
    delete process.env.INNGEST_SIGNING_KEY;
    process.env.DEPLOY_QUEUE_PROVIDER = "bullmq";
    resetInngestConfigForTests();
    resetNotificationsConfigForTests();

    const app = createApp();
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to bind test server");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

    if (savedInngestEnv.dev !== undefined) {
      process.env.INNGEST_DEV = savedInngestEnv.dev;
    } else {
      delete process.env.INNGEST_DEV;
    }
    if (savedInngestEnv.eventKey !== undefined) {
      process.env.INNGEST_EVENT_KEY = savedInngestEnv.eventKey;
    } else {
      delete process.env.INNGEST_EVENT_KEY;
    }
    if (savedInngestEnv.signingKey !== undefined) {
      process.env.INNGEST_SIGNING_KEY = savedInngestEnv.signingKey;
    } else {
      delete process.env.INNGEST_SIGNING_KEY;
    }
    if (savedInngestEnv.deployQueueProvider !== undefined) {
      process.env.DEPLOY_QUEUE_PROVIDER = savedInngestEnv.deployQueueProvider;
    } else {
      delete process.env.DEPLOY_QUEUE_PROVIDER;
    }

    resetInngestConfigForTests();
    resetNotificationsConfigForTests();
    delete process.env.NOTIFICATIONS_INTERNAL_API_KEY;

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

  it("returns 401 without internal API key", async () => {
    const response = await fetch(`${baseUrl}/api/v1/internal/notifications/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        privy_user_id: privyUserId,
        notification_type: "radiant.platform.agent_message",
        title: "Unauthorized",
        body: "Nope",
      }),
    });
    assert.equal(response.status, 401);
  });

  it("accepts emit with valid internal API key", async () => {
    const response = await fetch(`${baseUrl}/api/v1/internal/notifications/emit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-notifications-internal-key": internalApiKey,
      },
      body: JSON.stringify({
        privy_user_id: privyUserId,
        notification_type: "radiant.platform.agent_message",
        title: "Internal",
        body: "Emit ok",
        idempotency_key: "internal-emit-test-1",
      }),
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as { data?: { queued?: boolean; result?: { status?: string } } };
    assert.equal(body.data?.queued, false);
    assert.equal(body.data?.result?.status, "delivered");
  });
});
