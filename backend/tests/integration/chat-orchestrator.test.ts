import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { runChatTurn } from "../../src/services/agent/chat-orchestrator.js";
import { buildAgentContextMessages } from "../../src/services/agent/context-window.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import { createUserSession, getSessionMessages } from "../../src/services/conversation/conversation.service.js";
import { listMessagesBySessionId } from "../../src/services/conversation/message.repository.js";
import { findSessionForUser } from "../../src/services/conversation/session.repository.js";

const privyUserId = "did:privy:chat-orchestrator-test";

describe("chat orchestrator persistence", () => {
  const originalProvider = process.env.AGENT_PROVIDER;

  before(async () => {
    process.env.AGENT_PROVIDER = "stub";

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
        email: "orchestrator-test@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });
  });

  after(async () => {
    process.env.AGENT_PROVIDER = originalProvider;

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

  it("persists two turns and includes the first message in second-turn context", async () => {
    const session = await createUserSession(privyUserId);

    const first = await runChatTurn(privyUserId, {
      message: "Hello there",
      session_id: session.id,
    });

    assert.equal(first.mode, "stub");
    assert.ok(first.message_id);
    assert.ok(first.reply.length > 0);

    const second = await runChatTurn(privyUserId, {
      message: "Thanks",
      session_id: session.id,
    });

    assert.ok(second.message_id);

    const { messages, session: loadedSession } = await getSessionMessages(
      privyUserId,
      session.id,
    );

    assert.equal(messages.length, 4);
    assert.equal(messages[0]?.role, "user");
    assert.equal(messages[0]?.content, "Hello there");
    assert.equal(messages.at(-1)?.role, "assistant");
    assert.equal(loadedSession.title, "Hello there");

    const context = buildAgentContextMessages(
      await listMessagesBySessionId(session.id),
    );
    assert.equal(context[0]?.content, "Hello there");
    assert.ok(context.some((message) => message.role === "user" && message.content === "Thanks"));
  });

  it("creates a session when session_id is omitted", async () => {
    const response = await runChatTurn(privyUserId, {
      message: "Hello agent",
    });

    assert.ok(response.session_id);
    assert.ok(response.message_id);

    const user = await prisma.user.findUniqueOrThrow({
      where: { privy_user_id: privyUserId },
    });
    const owned = await findSessionForUser(response.session_id, user.id);
    assert.ok(owned);
    assert.equal(owned.title, "Hello agent");
  });
});
