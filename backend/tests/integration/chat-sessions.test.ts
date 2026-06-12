import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { createApp } from "../../src/app.js";
import { AppError } from "../../src/errors/app-error.js";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import {
  createUserSession,
  getSessionMessages,
} from "../../src/services/conversation/conversation.service.js";
import { appendMessage } from "../../src/services/conversation/message.repository.js";

const ownerPrivyId = "did:privy:chat-session-owner";
const otherPrivyId = "did:privy:chat-session-other";

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
    await prisma.$disconnect();
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
