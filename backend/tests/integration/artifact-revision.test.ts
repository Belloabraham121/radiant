import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import { createUserSession } from "../../src/services/conversation/conversation.service.js";
import { generateAppForUser } from "../../src/services/projects/generate-app.service.js";
import {
  getProjectArtifactPayloadForUser,
  listProjectRevisionsForUser,
  restoreProjectRevisionForUser,
  listSessionProjectsForUser,
} from "../../src/services/projects/project-artifact.service.js";

const privyUserId = "did:privy:artifact-revision-test";

describe("project artifact revisions", () => {
  let sessionId: string;

  before(async () => {
    await prisma.artifactFile.deleteMany({
      where: { project: { user: { privy_user_id: privyUserId } } },
    });
    await prisma.project.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.chatMessage.deleteMany({
      where: { session: { user: { privy_user_id: privyUserId } } },
    });
    await prisma.chatSession.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: privyUserId },
    });

    await prisma.user.create({
      data: {
        privy_user_id: privyUserId,
        email: "artifact-revision-test@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });

    const session = await createUserSession(privyUserId);
    sessionId = session.id;
  });

  after(async () => {
    await prisma.artifactFile.deleteMany({
      where: { project: { user: { privy_user_id: privyUserId } } },
    });
    await prisma.project.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.chatMessage.deleteMany({
      where: { session: { user: { privy_user_id: privyUserId } } },
    });
    await prisma.chatSession.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: privyUserId },
    });
    await prisma.$disconnect();
  });

  it("lists revisions, views old revision, and restores to new head", async () => {
    const guessing = await generateAppForUser(
      privyUserId,
      {
        name: "Guessing Game",
        template: "custom",
        files: [{ path: "src/App.tsx", content: "export default () => <div>guess</div>;" }],
      },
      { sessionId },
    );

    await generateAppForUser(
      privyUserId,
      {
        project_id: guessing.project_id,
        name: "Accounting Game",
        template: "custom",
        files: [{ path: "src/App.tsx", content: "export default () => <div>accounting</div>;" }],
      },
      { sessionId },
    );

    const counter = await generateAppForUser(
      privyUserId,
      {
        name: "Counter App",
        template: "custom",
        files: [{ path: "src/App.tsx", content: "export default () => <div>counter</div>;" }],
      },
      { sessionId },
    );

    const sessionProjects = await listSessionProjectsForUser(privyUserId, sessionId);
    assert.equal(sessionProjects.length, 2);

    const revisions = await listProjectRevisionsForUser(privyUserId, guessing.project_id);
    assert.equal(revisions.current_revision, 1);
    assert.equal(revisions.revisions.length, 2);

    const oldView = await getProjectArtifactPayloadForUser(
      privyUserId,
      guessing.project_id,
      0,
    );
    const guessApp = oldView.files.find((f) => f.path === "src/App.tsx");
    assert.match(guessApp?.content ?? "", /guess/);

    const restored = await restoreProjectRevisionForUser(privyUserId, guessing.project_id, 0);
    assert.equal(restored.revision, 2);
    const restoredApp = restored.files.find((f) => f.path === "src/App.tsx");
    assert.match(restoredApp?.content ?? "", /guess/);

    const head = await getProjectArtifactPayloadForUser(privyUserId, counter.project_id);
    const counterApp = head.files.find((f) => f.path === "src/App.tsx");
    assert.match(counterApp?.content ?? "", /counter/);
  });
});
