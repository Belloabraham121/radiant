import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer, type Server } from "node:http";
import { createApp } from "../../src/app.js";
import { resetInngestConfigForTests } from "../../src/config/inngest.js";
import { resetNotificationsConfigForTests } from "../../src/config/notifications.js";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import { listNotificationEventsForUser } from "../../src/services/notifications/notification-event.service.js";
import { processNotificationEvent } from "../../src/services/notifications/notification-event-evaluator.service.js";
import { createNotificationRuleForUser } from "../../src/services/notifications/notification-rule.service.js";
import { formatNotificationTypeKey } from "../../src/services/notifications/notification-schema.service.js";
import { PROJECT_NOTIFICATION_SCHEMA_VERSION } from "../../src/services/notifications/notification-schema.types.js";

const privyUserId = "did:privy:notification-event-eval-test";
const internalApiKey = "test-notifications-event-key";

const EVENT_NOTIFICATION_SCHEMA = {
  schema_version: PROJECT_NOTIFICATION_SCHEMA_VERSION,
  app_id: "",
  types: [
    {
      type: "status_changed",
      label: "Status changed",
      description: "Alert when an item status changes",
      trigger_kind: "event" as const,
      default_channels: ["in_app"] as const,
      condition_schema: [
        { name: "status", type: "string" as const, required: true },
        { name: "min_score", type: "number" as const },
      ],
      presentation: {
        title_template: "Status {{status}}",
        body_template: "Score {{score}}",
      },
    },
  ],
};

describe("notification event evaluator", () => {
  let projectId: string;
  let notificationType: string;
  let server: Server;
  let baseUrl: string;

  before(async () => {
    process.env.NOTIFICATIONS_INTERNAL_API_KEY = internalApiKey;
    resetNotificationsConfigForTests();
    delete process.env.INNGEST_DEV;
    delete process.env.INNGEST_EVENT_KEY;
    delete process.env.INNGEST_SIGNING_KEY;
    process.env.DEPLOY_QUEUE_PROVIDER = "bullmq";
    resetInngestConfigForTests();

    await prisma.notificationDelivery.deleteMany({
      where: { event: { user: { privy_user_id: privyUserId } } },
    });
    await prisma.notificationEvent.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.notificationRule.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.project.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: privyUserId },
    });

    await prisma.user.create({
      data: {
        privy_user_id: privyUserId,
        email: "notification-event-eval-test@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });

    const project = await prisma.project.create({
      data: {
        user: { connect: { privy_user_id: privyUserId } },
        name: "Event eval test",
        template: "custom",
        notification_schema: EVENT_NOTIFICATION_SCHEMA,
      },
    });
    projectId = project.id;
    notificationType = formatNotificationTypeKey(projectId, "status_changed");

    await prisma.project.update({
      where: { id: projectId },
      data: {
        notification_schema: {
          ...EVENT_NOTIFICATION_SCHEMA,
          app_id: projectId,
        },
      },
    });

    await createNotificationRuleForUser(
      privyUserId,
      { projectId },
      {
        notification_type: "status_changed",
        condition: { status: "outbid", min_score: 50 },
        channels: ["in_app"],
        cooldown_seconds: 0,
      },
      { source: "user" },
    );

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
  });

  it("matches event rules and delivers to inbox", async () => {
    const result = await processNotificationEvent({
      notificationType,
      projectId,
      data: { status: "outbid", score: 75 },
      idempotencyKey: "event-test-1",
    });

    assert.equal(result.rules_matched, 1);
    assert.equal(result.emitted, 1);

    const inbox = await listNotificationEventsForUser(privyUserId, { limit: 5 });
    assert.equal(inbox.events.length >= 1, true);
    assert.match(inbox.events[0]!.title, /outbid/i);
  });

  it("skips rules when event data does not match condition", async () => {
    const result = await processNotificationEvent({
      notificationType,
      projectId,
      data: { status: "outbid", score: 10 },
      idempotencyKey: "event-test-2",
    });

    assert.equal(result.rules_matched, 0);
    assert.equal(result.emitted, 0);
  });

  it("accepts webhook ingress with internal API key", async () => {
    const res = await fetch(`${baseUrl}/api/v1/webhooks/notifications/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-notifications-internal-key": internalApiKey,
      },
      body: JSON.stringify({
        notification_type: notificationType,
        project_id: projectId,
        data: { status: "outbid", score: 80 },
        idempotency_key: "event-test-webhook",
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as { success: boolean; data: { emitted: number } };
    assert.equal(json.success, true);
    assert.equal(json.data.emitted, 1);
  });
});
