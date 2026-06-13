import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { createApp } from "../../src/app.js";
import { AppError } from "../../src/errors/app-error.js";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import {
  getTransaction,
  listTransactions,
} from "../../src/services/agent-transaction/agent-transaction.service.js";

const ownerPrivyId = "did:privy:agent-tx-api-owner";
const otherPrivyId = "did:privy:agent-tx-api-other";

describe("agent transactions API", () => {
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

  it("returns 401 for GET /api/v1/agent/transactions without privy-token cookie", async () => {
    const response = await fetch(`${baseUrl}/api/v1/agent/transactions`);
    assert.equal(response.status, 401);
  });

  it("returns 401 for GET /api/v1/agent/transactions/:id without privy-token cookie", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/agent/transactions/00000000-0000-4000-8000-000000000099`,
    );
    assert.equal(response.status, 401);
  });

  it("returns 401 for GET /api/v1/chat/sessions/:sessionId/transactions without privy-token cookie", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/chat/sessions/00000000-0000-4000-8000-000000000099/transactions`,
    );
    assert.equal(response.status, 401);
  });
});

describe("agent transactions API ownership", () => {
  let transactionId: string;

  before(async () => {
    await prisma.agentTransaction.deleteMany({
      where: { user: { privy_user_id: { in: [ownerPrivyId, otherPrivyId] } } },
    });
    await prisma.agentWallet.deleteMany({
      where: { user: { privy_user_id: { in: [ownerPrivyId, otherPrivyId] } } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: { in: [ownerPrivyId, otherPrivyId] } },
    });

    const owner = await prisma.user.create({
      data: {
        privy_user_id: ownerPrivyId,
        email: "agent-tx-api-owner@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });

    await prisma.user.create({
      data: {
        privy_user_id: otherPrivyId,
        email: "agent-tx-api-other@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });

    await prisma.agentWallet.create({
      data: {
        user_id: owner.id,
        chain_type: "sui",
        address: "0x00000000000000000000000000000000000000000000000000000000000000bb",
        privy_wallet_id: "privy-wallet-agent-tx-api-owner-sui",
        signer_added: true,
      },
    });

    const row = await prisma.agentTransaction.create({
      data: {
        user_id: owner.id,
        chain_id: "sui",
        wallet_address: "0x00000000000000000000000000000000000000000000000000000000000000bb",
        action: "swap",
        params: { pool_key: "SUI_USDC", amount: 1, side: "sell" },
        category: "swap",
        title: "Swap on DeepBook (SUI_USDC)",
        amount_display: "1 SUI → ~2 USDC",
        status: "success",
        digest: "0xabc123",
        effects_status: "success",
      },
    });
    transactionId = row.id;
  });

  after(async () => {
    await prisma.agentTransaction.deleteMany({
      where: { user: { privy_user_id: { in: [ownerPrivyId, otherPrivyId] } } },
    });
    await prisma.agentWallet.deleteMany({
      where: { user: { privy_user_id: { in: [ownerPrivyId, otherPrivyId] } } },
    });
    await prisma.user.deleteMany({
      where: { privy_user_id: { in: [ownerPrivyId, otherPrivyId] } },
    });
    await prisma.$disconnect();
  });

  it("lists only the caller transactions", async () => {
    const ownerList = await listTransactions(ownerPrivyId, { limit: 10 });
    assert.ok(ownerList.total >= 1);
    assert.ok(ownerList.items.some((item) => item.id === transactionId));

    const otherList = await listTransactions(otherPrivyId, { limit: 10 });
    assert.ok(!otherList.items.some((item) => item.id === transactionId));
  });

  it("returns 404 when another user requests transaction detail", async () => {
    await assert.rejects(
      () => getTransaction(otherPrivyId, transactionId),
      (err: unknown) => err instanceof AppError && err.code === "TRANSACTION_NOT_FOUND",
    );
  });
});
