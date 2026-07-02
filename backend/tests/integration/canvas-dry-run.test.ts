import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import {
  createUserWorkflow,
  updateUserWorkflow,
} from "../../src/services/canvas/canvas-workflow.service.js";
import { runCanvasDryRunStreamStub } from "../../src/services/canvas/test/canvas-tester-agent.service.js";
import type { CanvasDryRunProgressEventName } from "../../src/services/canvas/test/canvas-test-progress.types.js";
import type { CanvasGraph } from "../../src/services/canvas/graph/canvas-graph.types.js";

const privyUserId = "did:privy:canvas-dry-run-test";

function sampleDryRunGraph(): CanvasGraph {
  const startId = randomUUID();
  const approveId = randomUUID();
  const orderId = randomUUID();
  const stopId = randomUUID();

  return {
    nodes: [
      { id: startId, type: "workflow_start", position: { x: 0, y: 0 }, config: {} },
      { id: approveId, type: "workflow_approve", position: { x: 200, y: 0 }, config: {} },
      {
        id: orderId,
        type: "place_order",
        position: { x: 400, y: 0 },
        config: { order_type: "limit", est_usd: 50 },
      },
      { id: stopId, type: "workflow_stop", position: { x: 600, y: 0 }, config: {} },
    ],
    edges: [
      {
        id: randomUUID(),
        source: { node_id: startId, port: "trigger" },
        target: { node_id: approveId, port: "trigger" },
      },
      {
        id: randomUUID(),
        source: { node_id: approveId, port: "trigger" },
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

describe("canvas dry run (stub)", () => {
  let workflowId: string;

  before(async () => {
    await prisma.canvasWorkflowRunEvent.deleteMany({
      where: { run: { user: { privy_user_id: privyUserId } } },
    });
    await prisma.canvasWorkflowRun.deleteMany({
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
        email: "canvas-dry-run@test.dev",
        ...defaultUserProfileFields(),
      },
    });

    const workflow = await createUserWorkflow(privyUserId, { name: "Dry run test" });
    workflowId = workflow.id;

    await updateUserWorkflow(privyUserId, workflowId, { graph: sampleDryRunGraph() });
  });

  after(async () => {
    await prisma.canvasWorkflowRunEvent.deleteMany({
      where: { run: { user: { privy_user_id: privyUserId } } },
    });
    await prisma.canvasWorkflowRun.deleteMany({
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

  it("executes dry run end-to-end with simulated actions and persisted events", async () => {
    const events: CanvasDryRunProgressEventName[] = [];

    await runCanvasDryRunStreamStub(privyUserId, workflowId, (event) => {
      events.push(event);
    });

    assert.ok(events.includes("workflow.run.started"));
    assert.ok(events.includes("workflow.run.node.simulated"));
    assert.equal(events.at(-1), "workflow.run.complete");

    const runs = await prisma.canvasWorkflowRun.findMany({
      where: { workflow_id: workflowId },
    });
    assert.equal(runs.length, 1);
    assert.equal(runs[0]!.mode, "dry");
    assert.equal(runs[0]!.status, "completed");

    const runEvents = await prisma.canvasWorkflowRunEvent.findMany({
      where: { run_id: runs[0]!.id },
      orderBy: { created_at: "asc" },
    });
    assert.ok(runEvents.length >= 4);
    assert.ok(runEvents.some((e) => e.event_type === "workflow.run.node.simulated"));
  });
});
