import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppError } from "../../src/errors/app-error.js";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import {
  getTransaction,
  listTransactions,
  loadPendingApprovalForUser,
  queryAgentTransactions,
  recordPendingApproval,
} from "../../src/services/agent-transaction/agent-transaction.service.js";
import { runQueryChainTool } from "../../src/services/agent/query-chain.tool.js";
import {
  createPendingTransaction,
  rejectPendingTransaction,
} from "../../src/services/agent/transaction-approval.service.js";
import type { PendingTransaction } from "../../src/services/agent/agent.types.js";

const ownerPrivyId = "did:privy:agent-tx-owner";
const otherPrivyId = "did:privy:agent-tx-other";

describe("agent-transaction.service", () => {
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
        email: "agent-tx-owner@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });

    await prisma.user.create({
      data: {
        privy_user_id: otherPrivyId,
        email: "agent-tx-other@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });

    await prisma.agentWallet.create({
      data: {
        user_id: owner.id,
        chain_type: "sui",
        address: "0x00000000000000000000000000000000000000000000000000000000000000aa",
        privy_wallet_id: "privy-wallet-agent-tx-owner-sui",
        signer_added: true,
      },
    });
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

  it("records pending approval with shared id", async () => {
    const pending: PendingTransaction = {
      id: "00000000-0000-4000-8000-000000000099",
      chain_id: "sui",
      action: "swap",
      params: {
        pool_key: "SUI_USDC",
        amount: 1,
        side: "sell",
        estimated_out_display: 2.4,
      },
      summary: "Swap on DeepBook (SUI_USDC)",
      amount_display: "1 SUI → ~2.4 USDC",
    };

    const row = await recordPendingApproval({
      privyUserId: ownerPrivyId,
      input: {
        chain_id: "sui",
        action: "swap",
        params: pending.params,
      },
      pending,
    });

    assert.equal(row.id, pending.id);
    assert.equal(row.status, "pending_approval");
    assert.equal(row.category, "swap");
  });

  it("lists only the caller transactions", async () => {
    const ownerList = await listTransactions(ownerPrivyId, { limit: 10 });
    assert.ok(ownerList.total >= 1);
    assert.ok(ownerList.items.every((item) => item.category === "swap"));

    await assert.rejects(
      () => getTransaction(otherPrivyId, ownerList.items[0]!.id),
      (err: unknown) => err instanceof AppError && err.code === "TRANSACTION_NOT_FOUND",
    );
  });

  it("createPendingTransaction persists to DB and reject loads from DB", async () => {
    const pending = await createPendingTransaction(ownerPrivyId, {
      chain_id: "sui",
      action: "transfer_native",
      params: {
        recipient:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        amount_atomic: String(30n * 1_000_000_000n),
      },
    });

    const loaded = await loadPendingApprovalForUser(ownerPrivyId, pending.id);
    assert.ok(loaded);
    assert.equal(loaded.status, "pending_approval");
    assert.equal(loaded.action, "transfer_native");

    const rejected = await rejectPendingTransaction(ownerPrivyId, pending.id);
    assert.ok(rejected);
    assert.equal(rejected.id, pending.id);

    const detail = await getTransaction(ownerPrivyId, pending.id);
    assert.equal(detail.status, "rejected");

    const missing = await loadPendingApprovalForUser(ownerPrivyId, pending.id);
    assert.equal(missing, null);
  });

  it("queryAgentTransactions caps limit at 10 and supports transaction_id lookup", async () => {
    const listed = await queryAgentTransactions(ownerPrivyId, { limit: 50, chainId: "sui" });
    assert.equal(listed.limit, 10);
    assert.ok(listed.items.length >= 1);

    const firstId = listed.items[0]!.id;
    const detail = await queryAgentTransactions(ownerPrivyId, {
      transactionId: firstId,
    });
    assert.equal(detail.total, 1);
    assert.equal(detail.limit, 1);
    assert.equal(detail.items[0]?.id, firstId);
    assert.ok("params" in (detail.items[0] ?? {}));
    assert.ok(typeof detail.summary === "string");
    assert.match(detail.summary, /Status:/);
  });

  it("runQueryChainTool returns agent_transactions for the authenticated user", async () => {
    const result = await runQueryChainTool(ownerPrivyId, {
      chain_id: "sui",
      query: "agent_transactions",
      params: { category: "swap", limit: 5 },
    });

    assert.ok("items" in result);
    assert.equal(result.limit, 5);
    assert.ok(result.items.length >= 1);
    assert.equal(result.items[0]?.category, "swap");
    assert.ok(typeof result.summary === "string");
    assert.match(result.summary, /Status:/);
    assert.match(result.summary, /Amount:/);
    assert.match(result.summary, /Date:/);
  });
});
