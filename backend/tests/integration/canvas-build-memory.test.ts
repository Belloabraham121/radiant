import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import {
  appendBuildMessage,
  clearBuildMessages,
  loadBuildMessages,
  loadRecentBuildContext,
} from "../../src/services/canvas/build/canvas-build-memory.service.js";
import { createUserWorkflow } from "../../src/services/canvas/canvas-workflow.service.js";

const privyUserId = "did:privy:canvas-build-memory-test";

describe("canvas build memory", () => {
  let workflowId: string;

  before(async () => {
    await prisma.canvasBuildMessage.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.canvasWorkflowRevision.deleteMany({
      where: { workflow: { user: { privy_user_id: privyUserId } } },
    });
    await prisma.canvasWorkflow.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.user.deleteMany({ where: { privy_user_id: privyUserId } });

    await prisma.user.create({
      data: {
        privy_user_id: privyUserId,
        email: "canvas-build-memory@test.dev",
        ...defaultUserProfileFields(),
      },
    });

    const workflow = await createUserWorkflow(privyUserId, { name: "Build memory test" });
    workflowId = workflow.id;
  });

  after(async () => {
    await prisma.canvasBuildMessage.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.canvasWorkflowRevision.deleteMany({
      where: { workflow: { user: { privy_user_id: privyUserId } } },
    });
    await prisma.canvasWorkflow.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.user.deleteMany({ where: { privy_user_id: privyUserId } });
    await prisma.$disconnect();
  });

  it("appends and loads messages in order", async () => {
    await clearBuildMessages(privyUserId, workflowId);

    await appendBuildMessage(privyUserId, workflowId, "user", "Build BTC alert");
    await appendBuildMessage(
      privyUserId,
      workflowId,
      "assistant",
      "Added price chart and threshold nodes.",
    );
    await appendBuildMessage(privyUserId, workflowId, "user", "Change threshold to 5%");

    const { messages } = await loadBuildMessages(privyUserId, workflowId);
    assert.equal(messages.length, 3);
    assert.equal(messages[0]?.role, "user");
    assert.equal(messages[1]?.role, "assistant");
    assert.equal(messages[2]?.content, "Change threshold to 5%");
  });

  it("loadRecentBuildContext returns capped history for follow-up turns", async () => {
    const context = await loadRecentBuildContext(privyUserId, workflowId);
    assert.equal(context.length, 3);
    assert.equal(context[0]?.content, "Build BTC alert");
    assert.equal(context.at(-1)?.content, "Change threshold to 5%");
  });

  it("clearBuildMessages removes workflow thread", async () => {
    const { cleared } = await clearBuildMessages(privyUserId, workflowId);
    assert.ok(cleared >= 3);

    const { messages } = await loadBuildMessages(privyUserId, workflowId);
    assert.equal(messages.length, 0);
  });
});
