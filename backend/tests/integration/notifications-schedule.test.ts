import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { resetInngestConfigForTests } from "../../src/config/inngest.js";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import { listNotificationEventsForUser } from "../../src/services/notifications/notification-event.service.js";
import { runScheduleEvaluatorCycle } from "../../src/services/notifications/notification-schedule-evaluator.service.js";
import { formatPlatformNotificationType } from "../../src/services/notifications/platform-notification-registry.js";

const privyUserId = "did:privy:notification-schedule-test";

describe("notification schedule evaluator cycle", () => {
  let userId: bigint;
  let ruleId: string;
  const savedInngestEnv = {
    dev: process.env.INNGEST_DEV,
    eventKey: process.env.INNGEST_EVENT_KEY,
    signingKey: process.env.INNGEST_SIGNING_KEY,
    deployQueueProvider: process.env.DEPLOY_QUEUE_PROVIDER,
  };

  before(async () => {
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
    await prisma.notificationPreference.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: privyUserId },
    });

    const user = await prisma.user.create({
      data: {
        privy_user_id: privyUserId,
        email: "notification-schedule-test@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });
    userId = user.id;

    await prisma.notificationPreference.create({
      data: {
        user_id: userId,
        timezone: "UTC",
      },
    });

    const rule = await prisma.notificationRule.create({
      data: {
        user_id: userId,
        source: "agent",
        notification_type: formatPlatformNotificationType("scheduled_reminder"),
        trigger_kind: "schedule",
        condition: { message: "Check your positions" },
        schedule: { kind: "once", at: "2020-01-01T12:00:00.000Z" },
        channels: ["in_app"],
        cooldown_seconds: 0,
        trigger_once: true,
        label: "Position check",
      },
    });
    ruleId = rule.id;
  });

  after(async () => {
    process.env.INNGEST_DEV = savedInngestEnv.dev;
    process.env.INNGEST_EVENT_KEY = savedInngestEnv.eventKey;
    process.env.INNGEST_SIGNING_KEY = savedInngestEnv.signingKey;
    process.env.DEPLOY_QUEUE_PROVIDER = savedInngestEnv.deployQueueProvider;
    resetInngestConfigForTests();
  });

  it("fires due once schedule and expires trigger_once rules", async () => {
    const summary = await runScheduleEvaluatorCycle();
    assert.equal(summary.candidates >= 1, true);
    assert.equal(summary.emitted >= 1, true);

    const inbox = await listNotificationEventsForUser(privyUserId, { limit: 10 });
    assert.equal(inbox.events.length >= 1, true);
    assert.match(inbox.events[0]!.body, /Check your positions/);

    const updatedRule = await prisma.notificationRule.findUnique({ where: { id: ruleId } });
    assert.equal(updatedRule?.status, "expired");
    assert.ok(updatedRule?.last_triggered_at);
  });

  it("deduplicates repeated schedule ticks", async () => {
    const second = await runScheduleEvaluatorCycle();
    assert.equal(second.candidates, 0);
  });
});
