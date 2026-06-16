import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import { createUserSession } from "../../src/services/conversation/conversation.service.js";
import { setExecuteTransactionWithApprovalHandlerForTests } from "../../src/services/agent/execute-transaction-with-approval.js";
import { listAppActionsCatalogForSession } from "../../src/services/projects/app-action-catalog.service.js";
import { runCallAppActionTool } from "../../src/services/projects/call-app-action.tool.js";
import {
  generateAppForUser,
  saveSessionDraftToProjectForUser,
} from "../../src/services/projects/generate-app.service.js";
import { listArtifactFiles } from "../../src/services/projects/artifact.repository.js";
import { PREVIEW_PROJECT_ID } from "../../src/services/projects/preview-project.js";
import { findProjectByIdForUser } from "../../src/services/projects/project.repository.js";
import { listSessionDraftFiles } from "../../src/services/projects/session-draft.repository.js";

const privyUserId = "did:privy:generate-app-test";

describe("generateAppForUser", () => {
  let userId: bigint;

  before(async () => {
    await prisma.chatSessionDraftFile.deleteMany({
      where: { draft: { session: { user: { privy_user_id: privyUserId } } } },
    });
    await prisma.chatSessionDraft.deleteMany({
      where: { session: { user: { privy_user_id: privyUserId } } },
    });
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
    await prisma.chatSessionDraftFile.deleteMany({
      where: { draft: { session: { user: { privy_user_id: privyUserId } } } },
    });
    await prisma.chatSessionDraft.deleteMany({
      where: { session: { user: { privy_user_id: privyUserId } } },
    });
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

  it("persists chat drafts by default and saves to Projects on demand", async () => {
    const session = await createUserSession(privyUserId);

    const first = await generateAppForUser(
      privyUserId,
      {
        name: "Counter",
        tagline: "A tiny counter",
        template: "custom",
        files: [
          {
            path: "components/Counter.tsx",
            content: "export default function Counter() { return <div>1</div>; }",
          },
        ],
      },
      { sessionId: session.id },
    );

    assert.equal(first.project_id, PREVIEW_PROJECT_ID);
    assert.equal(first.saved_to_project, false);
    assert.ok(first.draft_id);
    assert.equal(first.revision, 0);
    assert.ok(first.artifact.files.some((f) => f.path === "app/page.tsx"));
    assert.ok(first.artifact.files.some((f) => f.path === "lib/radiant-client.ts"));
    const radiantClient = first.artifact.files.find((f) => f.path === "lib/radiant-client.ts");
    assert.ok(radiantClient);
    assert.match(radiantClient!.content, /export async function executeSwap/);
    assert.deepEqual(first.artifact, {
      project_id: PREVIEW_PROJECT_ID,
      name: "Counter",
      tagline: "A tiny counter",
      template: "custom",
      revision: 0,
      files: first.files,
    });

    const projectsBeforeSave = await prisma.project.count({
      where: { user_id: userId },
    });
    assert.equal(projectsBeforeSave, 0);

    const draftFiles = await listSessionDraftFiles(first.draft_id!, 0);
    assert.ok(draftFiles.length >= 4);
    assert.ok(draftFiles.some((f) => f.path === "/workspace/app/page.tsx"));

    const saved = await saveSessionDraftToProjectForUser(privyUserId, session.id);
    assert.equal(saved.saved_to_project, true);
    assert.notEqual(saved.project_id, PREVIEW_PROJECT_ID);
    assert.equal(saved.revision, 0);

    const project = await findProjectByIdForUser(saved.project_id, userId);
    assert.ok(project);
    assert.equal(project.session_id, session.id);
    assert.equal(project.artifact_revision, 0);
    assert.ok(project.action_schema);
    const actionSchema = project.action_schema as {
      schema_version: number;
      protocol: string;
      actions: Array<{ name: string }>;
    };
    assert.equal(actionSchema.schema_version, 2);
    assert.equal(actionSchema.protocol, "deepbook");
    assert.ok(actionSchema.actions.some((action) => action.name === "swap"));

    const files = await listArtifactFiles(saved.project_id, 0);
    assert.ok(files.length >= 4);
    assert.ok(files.some((f) => f.path === "/workspace/app/page.tsx"));

    const second = await generateAppForUser(
      privyUserId,
      {
        project_id: saved.project_id,
        name: "Counter v2",
        template: "custom",
        files: [
          {
            path: "app/page.tsx",
            content: '"use client";\nexport default function Page() { return <div>2</div>; }',
          },
        ],
      },
      { sessionId: session.id },
    );

    assert.equal(second.revision, 1);
    assert.equal(second.name, "Counter v2");
    assert.equal(second.saved_to_project, true);
    const revisionFiles = await listArtifactFiles(saved.project_id, 1);
    const page = revisionFiles.find((f) => f.path === "/workspace/app/page.tsx");
    assert.ok(page);
    assert.match(page!.content, /2/);
  });

  it("margin template injects reference app and accepts margin_deposit on session draft", async () => {
    const session = await createUserSession(privyUserId);

    const draft = await generateAppForUser(
      privyUserId,
      {
        name: "Margin Demo",
        tagline: "Reference margin trading UI",
        template: "margin",
        files: [{ path: "components/CustomNote.tsx", content: "export default function CustomNote() { return null; }\n" }],
      },
      { sessionId: session.id },
    );

    assert.equal(draft.template, "margin");
    assert.ok(draft.files.some((file) => file.path === "components/MarginTradingApp.tsx"));
    assert.ok(draft.files.some((file) => file.path === "lib/radiant-actions.ts"));
    assert.ok(draft.files.some((file) => file.path === "lib/margin-agent-handlers.ts"));

    const catalog = await listAppActionsCatalogForSession(privyUserId, session.id);
    assert.ok(catalog.actions.some((entry) => entry.name === "margin_deposit"));
    assert.ok(catalog.actions.some((entry) => entry.name === "margin_provision_manager"));

    setExecuteTransactionWithApprovalHandlerForTests(async (_privy, input) => {
      assert.equal(input.action, "deepbook_margin_deposit");
      assert.equal(input.params.coin_type, "base");
      assert.equal(input.params.amount, 1.25);
      assert.equal(input.params.margin_manager_key, "default");

      return {
        status: "approval_required",
        agent_transaction_id: "55555555-5555-4555-8555-555555555555",
        pending: {
          id: "55555555-5555-4555-8555-555555555555",
          chain_id: "sui",
          action: "deepbook_margin_deposit",
          params: input.params,
          summary: "Deposit 1.25 base",
          amount_display: "1.25",
        },
      };
    });

    const actionResult = await runCallAppActionTool(
      privyUserId,
      {
        use_session_draft: true,
        action: "margin_deposit",
        params: { coin_type: "base", amount: "1.25" },
      },
      { sessionId: session.id },
    );

    assert.equal(actionResult.status, "approval_required");
    if (actionResult.status !== "approval_required") {
      return;
    }
    assert.equal(actionResult.action, "margin_deposit");
    assert.match(actionResult.pending.summary, /Deposit/);

    setExecuteTransactionWithApprovalHandlerForTests(null);
  });
});
