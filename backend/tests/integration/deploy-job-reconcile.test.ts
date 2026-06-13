import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import {
  reconcileDeployJobOnSandboxKilled,
} from "../../src/services/deploy/deploy-job.repository.js";

const privyUserId = "did:privy:deploy-job-reconcile-test";

describe("reconcileDeployJobOnSandboxKilled", () => {
  let projectId: string;
  let jobId: string;
  const sandboxId = "sandbox-test-abc";

  before(async () => {
    await prisma.deployJob.deleteMany({
      where: { project: { user: { privy_user_id: privyUserId } } },
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
        email: "deploy-reconcile@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });

    const project = await prisma.project.create({
      data: {
        user_id: user.id,
        name: "Reconcile test",
        template: "custom",
      },
    });
    projectId = project.id;

    const job = await prisma.deployJob.create({
      data: {
        project_id: projectId,
        status: "running",
        provider: "e2b",
        sandbox_id: sandboxId,
        artifact_revision: 0,
        started_at: new Date(),
      },
    });
    jobId = job.id;
  });

  after(async () => {
    await prisma.deployJob.deleteMany({
      where: { project: { user: { privy_user_id: privyUserId } } },
    });
    await prisma.project.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: privyUserId },
    });
    await prisma.$disconnect();
  });

  it("marks a running job failed when sandbox is killed", async () => {
    const result = await reconcileDeployJobOnSandboxKilled({
      sandboxId,
      executionTimeMs: 4500,
      killReason: "test kill",
    });

    assert.equal(result.jobId, jobId);
    assert.equal(result.action, "failed_running_job");

    const job = await prisma.deployJob.findUnique({ where: { id: jobId } });
    assert.equal(job?.status, "failed");
    assert.equal(job?.sandbox_seconds, 5);
    assert.equal(job?.error_message, "test kill");
    assert.ok(job?.finished_at);
  });

  it("ignores when no matching running job exists", async () => {
    const result = await reconcileDeployJobOnSandboxKilled({
      sandboxId: "unknown-sandbox",
    });
    assert.equal(result.jobId, null);
    assert.equal(result.action, "ignored");
  });
});
