import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import { createUserSession } from "../../src/services/conversation/conversation.service.js";
import { generateAppForUser } from "../../src/services/projects/generate-app.service.js";
import { listArtifactFiles } from "../../src/services/projects/artifact.repository.js";
import { findProjectByIdForUser } from "../../src/services/projects/project.repository.js";

const privyUserId = "did:privy:generate-app-test";

describe("generateAppForUser", () => {
  let userId: bigint;

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

    const user = await prisma.user.create({
      data: {
        privy_user_id: privyUserId,
        email: "generate-app-test@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });
    userId = user.id;
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

  it("creates a project and persists artifact files", async () => {
    const session = await createUserSession(privyUserId);

    const first = await generateAppForUser(
      privyUserId,
      {
        name: "Counter",
        tagline: "A tiny counter",
        template: "custom",
        files: [
          {
            path: "src/App.tsx",
            content: "export default function App() { return <div>1</div>; }",
          },
        ],
      },
      { sessionId: session.id },
    );

    assert.ok(first.project_id);
    assert.equal(first.revision, 0);
    assert.equal(first.artifact.files[0]?.path, "src/App.tsx");
    assert.deepEqual(first.artifact, {
      project_id: first.project_id,
      name: "Counter",
      tagline: "A tiny counter",
      template: "custom",
      revision: 0,
      files: first.files,
    });

    const project = await findProjectByIdForUser(first.project_id, userId);
    assert.ok(project);
    assert.equal(project.session_id, session.id);
    assert.equal(project.artifact_revision, 0);

    const files = await listArtifactFiles(first.project_id, 0);
    assert.equal(files.length, 1);
    assert.equal(files[0]?.path, "/workspace/src/App.tsx");

    const second = await generateAppForUser(
      privyUserId,
      {
        project_id: first.project_id,
        name: "Counter v2",
        template: "custom",
        files: [
          {
            path: "src/App.tsx",
            content: "export default function App() { return <div>2</div>; }",
          },
        ],
      },
      { sessionId: session.id },
    );

    assert.equal(second.revision, 1);
    assert.equal(second.name, "Counter v2");
    const revisionFiles = await listArtifactFiles(first.project_id, 1);
    assert.equal(revisionFiles[0]?.content, "export default function App() { return <div>2</div>; }");
  });
});
