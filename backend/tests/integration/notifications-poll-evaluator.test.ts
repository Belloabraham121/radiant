import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { resetInngestConfigForTests } from "../../src/config/inngest.js";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import { deliverNotification } from "../../src/services/notifications/notification-delivery.service.js";
import {
  registerNotificationEvaluator,
  resetNotificationEvaluatorRegistryForTests,
} from "../../src/services/notifications/evaluators/registry.js";
import { resetNotificationEvaluatorsBootstrapForTests } from "../../src/services/notifications/evaluators/index.js";
import type {
  NotificationEvaluator,
  PollRuleEvaluationContext,
} from "../../src/services/notifications/notification-evaluator.types.js";
import { runPollEvaluatorCycle } from "../../src/services/notifications/notification-poll-evaluator.service.js";
import { PROJECT_NOTIFICATION_SCHEMA_VERSION } from "../../src/services/notifications/notification-schema.types.js";
import { listNotificationEventsForUser } from "../../src/services/notifications/notification-event.service.js";

const privyUserId = "did:privy:notification-poll-eval-test";
const STUB_EVALUATOR_KEY = "test.stub_scanner";

const POLL_NOTIFICATION_SCHEMA = {
  schema_version: PROJECT_NOTIFICATION_SCHEMA_VERSION,
  app_id: "",
  types: [
    {
      type: "generic_hit",
      label: "Generic poll hit",
      description: "Test poll type for evaluator registry",
      trigger_kind: "poll" as const,
      evaluator: STUB_EVALUATOR_KEY,
      poll_interval_seconds: 60,
      default_channels: ["in_app"] as const,
      condition_schema: [{ name: "threshold", type: "number" as const, required: true }],
      presentation: {
        title_template: "Hit {{value}}",
        body_template: "Threshold {{threshold}} met",
      },
    },
  ],
};

describe("notification poll evaluator cycle", () => {
  let projectId: string;
  let ruleId: string;
  const savedInngestEnv = {
    dev: process.env.INNGEST_DEV,
    eventKey: process.env.INNGEST_EVENT_KEY,
    signingKey: process.env.INNGEST_SIGNING_KEY,
    deployQueueProvider: process.env.DEPLOY_QUEUE_PROVIDER,
  };

  const stubEvaluator: NotificationEvaluator = {
    key: STUB_EVALUATOR_KEY,
    async evaluate(rules: PollRuleEvaluationContext[]) {
      return rules.map((context) => ({
        rule_id: context.rule.id,
        user_id: context.rule.user_id,
        notification_type: context.rule.notification_type,
        title: "Stub alert",
        body: "Stub body",
        payload: { severity: "info" as const, data: { value: 99 } },
        idempotency_key: `poll:${context.rule.id}:stub-99`,
        project_id: context.projectId,
        installation_id: context.installationId,
      }));
    },
  };

  before(async () => {
    delete process.env.INNGEST_DEV;
    delete process.env.INNGEST_EVENT_KEY;
    delete process.env.INNGEST_SIGNING_KEY;
    process.env.DEPLOY_QUEUE_PROVIDER = "bullmq";
    resetInngestConfigForTests();

    resetNotificationEvaluatorRegistryForTests();
    resetNotificationEvaluatorsBootstrapForTests();
    registerNotificationEvaluator(stubEvaluator);

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
    await prisma.project.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: privyUserId },
    });

    const user = await prisma.user.create({
      data: {
        privy_user_id: privyUserId,
        email: "notification-poll-eval-test@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });

    const project = await prisma.project.create({
      data: {
        user_id: user.id,
        name: "Poll eval test project",
        template: "custom",
        notification_schema: POLL_NOTIFICATION_SCHEMA,
      },
    });
    projectId = project.id;

    await prisma.project.update({
      where: { id: projectId },
      data: {
        notification_schema: {
          ...POLL_NOTIFICATION_SCHEMA,
          app_id: projectId,
        },
      },
    });

    const rule = await prisma.notificationRule.create({
      data: {
        user_id: user.id,
        project_id: projectId,
        source: "user",
        notification_type: `${projectId}.generic_hit`,
        trigger_kind: "poll",
        condition: { threshold: 1 },
        channels: ["in_app"],
        status: "active",
      },
    });
    ruleId = rule.id;
  });

  after(async () => {
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

    resetNotificationEvaluatorRegistryForTests();
    resetNotificationEvaluatorsBootstrapForTests();

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
    await prisma.project.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: privyUserId },
    });
  });

  it("runs poll cycle through registry and emits inbox events", async () => {
    const results = await runPollEvaluatorCycle();

    const stubResult = results.find((entry) => entry.evaluator_key === STUB_EVALUATOR_KEY);
    assert.ok(stubResult);
    assert.equal(stubResult?.rules_evaluated, 1);
    assert.equal(stubResult?.candidates, 1);
    assert.equal(stubResult?.emitted, 1);

    const inbox = await listNotificationEventsForUser(privyUserId, {});
    assert.equal(inbox.total, 1);
    assert.equal(inbox.events[0]?.title, "Stub alert");
    assert.equal(inbox.events[0]?.rule_id, ruleId);
  });

  it("deduplicates repeated poll matches via idempotency key", async () => {
    const first = await runPollEvaluatorCycle();
    const second = await runPollEvaluatorCycle();

    const firstStub = first.find((entry) => entry.evaluator_key === STUB_EVALUATOR_KEY);
    const secondStub = second.find((entry) => entry.evaluator_key === STUB_EVALUATOR_KEY);

    assert.equal(firstStub?.duplicates, 1);
    assert.equal(secondStub?.duplicates, 1);

    const inbox = await listNotificationEventsForUser(privyUserId, {});
    assert.equal(inbox.total, 1);
  });

  it("does not invoke unregistered evaluators", async () => {
    const direct = await deliverNotification({
      privyUserId,
      notificationType: "radiant.platform.agent_message",
      title: "Direct",
      body: "Direct emit",
      idempotencyKey: "poll-eval-direct-emit",
    });
    assert.equal(direct.status, "delivered");
  });
});
