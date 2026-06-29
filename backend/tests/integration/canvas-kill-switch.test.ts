import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import {
  createUserWorkflow,
  updateUserWorkflow,
} from "../../src/services/canvas/canvas-workflow.service.js";
import { setKillSwitchState } from "../../src/services/canvas/policy/canvas-kill-switch.js";
import { executeLiveGraphRun } from "../../src/services/canvas/runtime/graph-executor.js";
import type { CanvasGraph } from "../../src/services/canvas/graph/canvas-graph.types.js";
import { clearMemoryCacheForTests } from "../../src/infrastructure/redis/cache.js";
import { resetKillSwitchMemoryForTests } from "../../src/services/canvas/policy/canvas-kill-switch.js";

const privyUserId = "did:privy:canvas-kill-switch-test";

function sampleLiveGraph(): CanvasGraph {
  const startId = randomUUID();
  const orderId = randomUUID();
  const stopId = randomUUID();

  return {
    nodes: [
      { id: startId, type: "workflow_start", position: { x: 0, y: 0 }, config: {} },
      {
        id: orderId,
        type: "place_order",
        position: { x: 200, y: 0 },
        config: {
          order_type: "limit",
          est_usd: 25,
          token_id: "123456789",
          size: 1,
          price: 0.5,
        },
      },
      { id: stopId, type: "workflow_stop", position: { x: 400, y: 0 }, config: {} },
    ],
    edges: [
      {
        id: randomUUID(),
        source: { node_id: startId, port: "trigger" },
        target: { node_id: orderId, port: "trigger" },
      },
      {
        id: randomUUID(),
        source: { node_id: orderId, port: "data" },
        target: { node_id: stopId, port: "signal" },
      },
    ],
  };
}

describe("canvas kill switch halts before sign", () => {
  let workflowId: string;

  before(async () => {
    process.env.CANVAS_RUNTIME_MOCK = "true";

    await prisma.canvasWorkflowRunEvent.deleteMany({
      where: { run: { user: { privy_user_id: privyUserId } } },
    });
    await prisma.canvasWorkflowRun.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.canvasWorkflowRuntime.deleteMany({
      where: { workflow: { user: { privy_user_id: privyUserId } } },
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
        email: "canvas-kill@test.dev",
        ...defaultUserProfileFields(),
      },
    });

    const workflow = await createUserWorkflow(privyUserId, { name: "Kill switch test" });
    workflowId = workflow.id;
    await updateUserWorkflow(privyUserId, workflowId, { graph: sampleLiveGraph() });
  });

  after(async () => {
    delete process.env.CANVAS_RUNTIME_MOCK;
    resetKillSwitchMemoryForTests();
    clearMemoryCacheForTests();

    await prisma.canvasWorkflowRunEvent.deleteMany({
      where: { run: { user: { privy_user_id: privyUserId } } },
    });
    await prisma.canvasWorkflowRun.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.canvasWorkflowRuntime.deleteMany({
      where: { workflow: { user: { privy_user_id: privyUserId } } },
    });
    await prisma.canvasWorkflowRevision.deleteMany({
      where: { workflow: { user: { privy_user_id: privyUserId } } },
    });
    await prisma.canvasWorkflow.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.user.deleteMany({ where: { privy_user_id: privyUserId } });
  });

  it("halts live run when kill switch is active before order submit", async () => {
    await setKillSwitchState(workflowId, true);

    const result = await executeLiveGraphRun({
      privyUserId,
      workflowId,
      confirmLive: true,
    });

    assert.equal(result.status, "cancelled");
    assert.match(result.summary, /kill switch/i);

    const runs = await prisma.canvasWorkflowRun.findMany({
      where: { workflow_id: workflowId },
      orderBy: { started_at: "desc" },
    });
    assert.equal(runs[0]?.mode, "live");
    assert.equal(runs[0]?.status, "cancelled");

    const executed = await prisma.canvasWorkflowRunEvent.findMany({
      where: {
        run_id: runs[0]!.id,
        event_type: "workflow.run.node.executed",
      },
    });
    assert.equal(executed.length, 0);
  });
});
