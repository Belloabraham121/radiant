import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { createApp } from "../../src/app.js";
import { AppError } from "../../src/errors/app-error.js";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import {
  createUserSession,
  deleteUserSession,
  getSessionMessages,
  sessionAppDataProjectId,
} from "../../src/services/conversation/conversation.service.js";
import { appendMessage } from "../../src/services/conversation/message.repository.js";
import { initAppDataStorage } from "../../src/services/app-data/app-data.storage.js";
import { upsertAppData } from "../../src/services/app-data/app-data.repository.js";

const ownerPrivyId = "did:privy:chat-session-owner";
const otherPrivyId = "did:privy:chat-session-other";
const deleteOwnerPrivyId = "did:privy:chat-delete-owner";
const deleteOtherPrivyId = "did:privy:chat-delete-other";

describe("chat sessions API", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = createApp();
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to bind test server");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("returns 401 for GET /api/v1/chat/sessions without privy-token cookie", async () => {
    const response = await fetch(`${baseUrl}/api/v1/chat/sessions`);
    assert.equal(response.status, 401);
  });

  it("returns 401 for POST /api/v1/chat/sessions without privy-token cookie", async () => {
    const response = await fetch(`${baseUrl}/api/v1/chat/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 401);
  });

  it("returns 401 for GET /api/v1/chat/sessions/:id/messages without privy-token cookie", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/chat/sessions/00000000-0000-4000-8000-000000000001/messages`,
    );
    assert.equal(response.status, 401);
  });

  it("returns 401 for DELETE /api/v1/chat/sessions/:id without privy-token cookie", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/chat/sessions/00000000-0000-4000-8000-000000000001`,
      { method: "DELETE" },
    );
    assert.equal(response.status, 401);
  });
});

describe("chat session ownership", () => {
  let sessionId: string;

  before(async () => {
    await prisma.chatMessage.deleteMany({
      where: { session: { user: { privy_user_id: { in: [ownerPrivyId, otherPrivyId] } } } },
    });
    await prisma.chatSession.deleteMany({
      where: { user: { privy_user_id: { in: [ownerPrivyId, otherPrivyId] } } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: { in: [ownerPrivyId, otherPrivyId] } },
    });

    await prisma.user.create({
      data: {
        privy_user_id: ownerPrivyId,
        email: "chat-owner@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });
    await prisma.user.create({
      data: {
        privy_user_id: otherPrivyId,
        email: "chat-other@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });

    const session = await createUserSession(ownerPrivyId, { title: "Owner thread" });
    sessionId = session.id;
    await appendMessage(sessionId, "user", "What's my balance?");
  });

  after(async () => {
    await prisma.chatMessage.deleteMany({
      where: { session: { user: { privy_user_id: { in: [ownerPrivyId, otherPrivyId] } } } },
    });
    await prisma.chatSession.deleteMany({
      where: { user: { privy_user_id: { in: [ownerPrivyId, otherPrivyId] } } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: { in: [ownerPrivyId, otherPrivyId] } },
    });
  });

  it("allows the owner to load session messages", async () => {
    const data = await getSessionMessages(ownerPrivyId, sessionId);
    assert.equal(data.session.id, sessionId);
    assert.equal(data.messages.length, 1);
    assert.equal(data.messages[0]?.content, "What's my balance?");
  });

  it("returns 404 when another user requests the same session", async () => {
    await assert.rejects(
      () => getSessionMessages(otherPrivyId, sessionId),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 404);
        assert.equal(err.code, "SESSION_NOT_FOUND");
        return true;
      },
    );
  });
});

describe("delete chat session", () => {
  let ownerUserId: bigint;
  let sessionId: string;
  let messageId: string;
  let draftId: string;
  let savedProjectId: string;
  let transactionId: string;

  before(async () => {
    await initAppDataStorage();

    await prisma.appData.deleteMany({
      where: {
        user_id: {
          in: (
            await prisma.user.findMany({
              where: { privy_user_id: { in: [deleteOwnerPrivyId, deleteOtherPrivyId] } },
              select: { id: true },
            })
          ).map((user) => user.id),
        },
      },
    });
    await prisma.agentTransaction.deleteMany({
      where: { user: { privy_user_id: { in: [deleteOwnerPrivyId, deleteOtherPrivyId] } } },
    });
    await prisma.chatSessionDraftFile.deleteMany({
      where: {
        draft: { session: { user: { privy_user_id: { in: [deleteOwnerPrivyId, deleteOtherPrivyId] } } } },
      },
    });
    await prisma.chatSessionDraft.deleteMany({
      where: { session: { user: { privy_user_id: { in: [deleteOwnerPrivyId, deleteOtherPrivyId] } } } },
    });
    await prisma.artifactFile.deleteMany({
      where: { project: { user: { privy_user_id: { in: [deleteOwnerPrivyId, deleteOtherPrivyId] } } } },
    });
    await prisma.project.deleteMany({
      where: { user: { privy_user_id: { in: [deleteOwnerPrivyId, deleteOtherPrivyId] } } },
    });
    await prisma.chatMessage.deleteMany({
      where: { session: { user: { privy_user_id: { in: [deleteOwnerPrivyId, deleteOtherPrivyId] } } } },
    });
    await prisma.chatSession.deleteMany({
      where: { user: { privy_user_id: { in: [deleteOwnerPrivyId, deleteOtherPrivyId] } } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: { in: [deleteOwnerPrivyId, deleteOtherPrivyId] } },
    });

    const owner = await prisma.user.create({
      data: {
        privy_user_id: deleteOwnerPrivyId,
        email: "chat-delete-owner@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });
    ownerUserId = owner.id;

    await prisma.user.create({
      data: {
        privy_user_id: deleteOtherPrivyId,
        email: "chat-delete-other@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });

    const session = await createUserSession(deleteOwnerPrivyId, { title: "Delete me" });
    sessionId = session.id;

    const message = await appendMessage(sessionId, "user", "Hello world");
    messageId = message.id;

    const draft = await prisma.chatSessionDraft.create({
      data: {
        session_id: sessionId,
        name: "Draft app",
        tagline: "Test draft",
        template: "todo",
        files: {
          create: [{ path: "App.tsx", content: "export default function App() {}", revision: 0 }],
        },
      },
    });
    draftId = draft.id;

    const project = await prisma.project.create({
      data: {
        user_id: ownerUserId,
        session_id: sessionId,
        name: "Saved from chat",
        template: "todo",
        status: "draft",
      },
    });
    savedProjectId = project.id;

    const transaction = await prisma.agentTransaction.create({
      data: {
        user_id: ownerUserId,
        session_id: sessionId,
        message_id: messageId,
        chain_id: "sui",
        wallet_address: "0x00000000000000000000000000000000000000000000000000000000000000aa",
        action: "swap",
        params: { pool_key: "SUI_USDC" },
        category: "swap",
        title: "Swap in chat",
        amount_display: "1 SUI",
        status: "success",
        digest: "0xdelete-chat-test-digest",
        effects_status: "success",
      },
    });
    transactionId = transaction.id;

    await upsertAppData({
      projectId: sessionAppDataProjectId(sessionId),
      userId: ownerUserId,
      collection: "todos",
      key: "item-1",
      data: { text: "Buy milk" },
    });
  });

  after(async () => {
    await prisma.appData.deleteMany({
      where: { user_id: ownerUserId },
    });
    await prisma.agentTransaction.deleteMany({
      where: { user: { privy_user_id: { in: [deleteOwnerPrivyId, deleteOtherPrivyId] } } },
    });
    await prisma.chatSessionDraftFile.deleteMany({
      where: {
        draft: { session: { user: { privy_user_id: { in: [deleteOwnerPrivyId, deleteOtherPrivyId] } } } },
      },
    });
    await prisma.chatSessionDraft.deleteMany({
      where: { session: { user: { privy_user_id: { in: [deleteOwnerPrivyId, deleteOtherPrivyId] } } } },
    });
    await prisma.artifactFile.deleteMany({
      where: { project: { user: { privy_user_id: { in: [deleteOwnerPrivyId, deleteOtherPrivyId] } } } },
    });
    await prisma.project.deleteMany({
      where: { user: { privy_user_id: { in: [deleteOwnerPrivyId, deleteOtherPrivyId] } } },
    });
    await prisma.chatMessage.deleteMany({
      where: { session: { user: { privy_user_id: { in: [deleteOwnerPrivyId, deleteOtherPrivyId] } } } },
    });
    await prisma.chatSession.deleteMany({
      where: { user: { privy_user_id: { in: [deleteOwnerPrivyId, deleteOtherPrivyId] } } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: { in: [deleteOwnerPrivyId, deleteOtherPrivyId] } },
    });
    await prisma.$disconnect();
  });

  it("returns 404 when another user tries to delete the session", async () => {
    await assert.rejects(
      () => deleteUserSession(deleteOtherPrivyId, sessionId),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 404);
        assert.equal(err.code, "SESSION_NOT_FOUND");
        return true;
      },
    );
  });

  it("deletes chat, draft, and session app data while keeping saved project and activity", async () => {
    const result = await deleteUserSession(deleteOwnerPrivyId, sessionId);
    assert.equal(result.id, sessionId);
    assert.equal(result.deleted, true);

    const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
    assert.equal(session, null);

    const messageCount = await prisma.chatMessage.count({ where: { session_id: sessionId } });
    assert.equal(messageCount, 0);

    const draft = await prisma.chatSessionDraft.findUnique({ where: { id: draftId } });
    assert.equal(draft, null);

    const appDataCount = await prisma.appData.count({
      where: { project_id: sessionAppDataProjectId(sessionId) },
    });
    assert.equal(appDataCount, 0);

    const project = await prisma.project.findUnique({ where: { id: savedProjectId } });
    assert.ok(project);
    assert.equal(project.session_id, null);

    const transaction = await prisma.agentTransaction.findUnique({ where: { id: transactionId } });
    assert.ok(transaction);
    assert.equal(transaction.session_id, null);
    assert.equal(transaction.message_id, null);

    await assert.rejects(
      () => getSessionMessages(deleteOwnerPrivyId, sessionId),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 404);
        return true;
      },
    );
  });
});
