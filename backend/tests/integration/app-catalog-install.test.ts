import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import { upsertArtifactFiles } from "../../src/services/projects/artifact.repository.js";
import { listPublicApps, getPublicApp } from "../../src/services/apps/app-catalog.service.js";
import {
  installPublicAppForUser,
  listInstallationsForUser,
  publishProjectForUser,
} from "../../src/services/apps/app-installation.service.js";

const ownerPrivyId = "did:privy:apps-catalog-owner";
const installerPrivyId = "did:privy:apps-catalog-installer";

describe("explorer catalog + install", () => {
  let projectId: string;

  before(async () => {
    await prisma.appInstallation.deleteMany({
      where: {
        OR: [
          { user: { privy_user_id: installerPrivyId } },
          { source_project: { user: { privy_user_id: ownerPrivyId } } },
        ],
      },
    });
    await prisma.artifactFile.deleteMany({
      where: { project: { user: { privy_user_id: ownerPrivyId } } },
    });
    await prisma.project.deleteMany({
      where: { user: { privy_user_id: { in: [ownerPrivyId, installerPrivyId] } } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: { in: [ownerPrivyId, installerPrivyId] } },
    });

    const owner = await prisma.user.create({
      data: {
        privy_user_id: ownerPrivyId,
        email: "apps-owner@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });
    await prisma.user.create({
      data: {
        privy_user_id: installerPrivyId,
        email: "apps-installer@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });

    const project = await prisma.project.create({
      data: {
        user_id: owner.id,
        name: "Public Swap",
        tagline: "Installable swap UI",
        template: "custom",
        category: "swap",
        status: "live",
        artifact_revision: 0,
        is_public: false,
      },
    });
    projectId = project.id;

    await upsertArtifactFiles(projectId, 0, [
      {
        path: "/workspace/app/page.tsx",
        content: "export default function Page() { return <div>swap</div>; }",
      },
      {
        path: "/workspace/lib/radiant-client.ts",
        content: "export async function swapQuote() { return {}; }",
      },
    ]);
  });

  after(async () => {
    await prisma.appInstallation.deleteMany({
      where: {
        OR: [
          { user: { privy_user_id: installerPrivyId } },
          { source_project: { user: { privy_user_id: ownerPrivyId } } },
        ],
      },
    });
    await prisma.artifactFile.deleteMany({
      where: { project: { user: { privy_user_id: ownerPrivyId } } },
    });
    await prisma.project.deleteMany({
      where: { user: { privy_user_id: { in: [ownerPrivyId, installerPrivyId] } } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: { in: [ownerPrivyId, installerPrivyId] } },
    });
    await prisma.$disconnect();
  });

  it("publishes a live project and lists it in the public catalog", async () => {
    const published = await publishProjectForUser(ownerPrivyId, projectId, {
      is_public: true,
      fee_bps: 25,
      category: "swap",
      tagline: "DeepBook swap for everyone",
    });
    assert.equal(published.is_public, true);
    assert.equal(published.fee_bps, 25);

    const catalog = await listPublicApps({});
    const match = catalog.apps.find((app) => app.id === projectId);
    assert.ok(match);
    assert.equal(match?.name, "Public Swap");
    assert.equal(match?.fee_bps, 25);

    const detail = await getPublicApp(projectId);
    assert.equal(detail.install_count, 0);
  });

  it("installs a public app for another user", async () => {
    const first = await installPublicAppForUser(installerPrivyId, projectId);
    assert.equal(first.already_installed, false);
    assert.ok(first.installation_id);

    const second = await installPublicAppForUser(installerPrivyId, projectId);
    assert.equal(second.already_installed, true);
    assert.equal(second.installation_id, first.installation_id);

    const listed = await listInstallationsForUser(installerPrivyId);
    assert.equal(listed.installations.length, 1);
    assert.equal(listed.installations[0]?.source_project_id, projectId);

    const catalog = await listPublicApps({});
    const match = catalog.apps.find((app) => app.id === projectId);
    assert.equal(match?.install_count, 1);
  });
});
