import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { resetWalrusConfigForTests } from "../../src/config/walrus.js";
import { resetSandboxConfigForTests } from "../../src/config/sandbox.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import { runDeployPipeline } from "../../src/services/deploy/pipeline.js";

const privyUserId = "did:privy:deploy-pipeline-test";

describe("runDeployPipeline (fixed template)", () => {
  let projectId: string;
  let jobId: string;

  before(async () => {
    process.env.SANDBOX_PROVIDER = "mock";
    process.env.WALRUS_DEPLOY_MOCK = "true";
    resetSandboxConfigForTests();
    resetWalrusConfigForTests();

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
        email: "deploy-pipeline@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });

    const project = await prisma.project.create({
      data: {
        user_id: user.id,
        name: "Escrow demo",
        template: "escrow",
        tagline: "Test deploy",
      },
    });
    projectId = project.id;

    const job = await prisma.deployJob.create({
      data: {
        project_id: projectId,
        provider: "none",
        artifact_revision: 0,
        status: "queued",
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

  it("deploys a fixed template to mock Walrus and marks project live", async () => {
    await runDeployPipeline(jobId);

    const job = await prisma.deployJob.findUnique({ where: { id: jobId } });
    assert.equal(job?.status, "completed");

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    assert.equal(project?.status, "live");
    assert.ok(project?.walrus_url?.includes(".walrus.site"));
  });
});
