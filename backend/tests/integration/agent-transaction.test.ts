import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppError } from "../../src/errors/app-error.js";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import {
  getTransaction,
  listTransactions,
  recordPendingApproval,
} from "../../src/services/agent-transaction/agent-transaction.service.js";
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
});
