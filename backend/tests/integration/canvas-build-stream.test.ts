import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import { createUserWorkflow } from "../../src/services/canvas/canvas-workflow.service.js";
import { runCanvasBuildStreamStub } from "../../src/services/canvas/build/canvas-builder-agent.service.js";
import type { CanvasBuildProgressEventName } from "../../src/services/canvas/build/canvas-build-progress.types.js";

const privyUserId = "did:privy:canvas-build-stream-test";

describe("canvas build stream (stub)", () => {
  let workflowId: string;

  before(async () => {
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
        email: "canvas-build@test.dev",
        ...defaultUserProfileFields(),
      },
    });

    const workflow = await createUserWorkflow(privyUserId, { name: "Build stream test" });
    workflowId = workflow.id;
  });

  after(async () => {
    await prisma.canvasWorkflowRevision.deleteMany({
      where: { workflow: { user: { privy_user_id: privyUserId } } },
    });
    await prisma.canvasWorkflow.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.user.deleteMany({ where: { privy_user_id: privyUserId } });
    await prisma.$disconnect();
  });

  it("emits ordered workflow events ending with workflow.build.complete", async () => {
    const events: CanvasBuildProgressEventName[] = [];

    await runCanvasBuildStreamStub(privyUserId, workflowId, (event) => {
      events.push(event);
    });

    assert.ok(events.includes("workflow.node.add"));
    assert.ok(events.includes("workflow.edge.add"));
    assert.equal(events.at(-1), "workflow.build.complete");
    assert.ok(events.filter((e) => e === "workflow.node.add").length >= 3);
    assert.ok(events.indexOf("workflow.edge.add") < events.indexOf("workflow.build.complete"));

    const workflow = await prisma.canvasWorkflow.findUnique({ where: { id: workflowId } });
    assert.ok(workflow);
    const graph = workflow.graph as { nodes: unknown[]; edges: unknown[] };
    assert.ok(graph.nodes.length >= 3);
    assert.ok(graph.edges.length >= 1);
    assert.equal(workflow.status, "dry_run_ready");
    assert.ok(workflow.revision >= 4);
  });
});
