import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { prisma } from "../../../src/infrastructure/postgres/client.js";
import { defaultUserProfileFields } from "../../../src/services/auth/user.repository.js";
import {
  ensureBalanceManager,
  parseDeepBookDepositWithdrawParams,
  resetBalanceManagerServiceForTests,
} from "../../../src/services/defi/deepbook-balance-manager.service.js";
import {
  createBalanceManager,
  findBalanceManagerByPrivyUserId,
} from "../../../src/services/defi/deepbook-balance-manager.repository.js";
import { defaultAgentPermissions } from "../../../src/services/agent/agent-permissions.service.js";
import { transferRequiresApprovalWithPermissions } from "../../../src/services/agent/transaction-approval.service.js";
import { clearPendingTransactionsForTests } from "../../../src/services/agent/transaction-approval.service.js";

const privyUserId = "did:privy:deepbook-bm-test";
const managerObjectId = `0x${"b".repeat(64)}`;

describe("deepbook-balance-manager.service", () => {
  before(async () => {
    await prisma.deepBookBalanceManager.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.user.deleteMany({ where: { privy_user_id: privyUserId } });

    await prisma.user.create({
      data: {
        privy_user_id: privyUserId,
        email: "deepbook-bm@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });
  });

  afterEach(() => {
    resetBalanceManagerServiceForTests();
    clearPendingTransactionsForTests();
  });

  after(async () => {
    await prisma.deepBookBalanceManager.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.user.deleteMany({ where: { privy_user_id: privyUserId } });
    await prisma.$disconnect();
  });

  it("parseDeepBookDepositWithdrawParams accepts display and atomic amounts", () => {
    const parsed = parseDeepBookDepositWithdrawParams({
      coin_key: "sui",
      amount_display: 1.5,
    });
    assert.equal(parsed.coin_key, "SUI");
    assert.equal(parsed.amount_display, 1.5);

    const fromAtomic = parseDeepBookDepositWithdrawParams({
      coin_key: "USDC",
      amount_atomic: "1500000",
    });
    assert.equal(fromAtomic.coin_key, "USDC");
    assert.equal(fromAtomic.amount_display, 1.5);
  });

  it("ensureBalanceManager is idempotent when a row already exists", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { privy_user_id: privyUserId },
    });

    await createBalanceManager({
      user: { connect: { id: user.id } },
      chain_id: "sui",
      manager_object_id: managerObjectId,
      manager_key: "RADIANT_BM_1",
    });

    const first = await ensureBalanceManager(privyUserId);
    const second = await ensureBalanceManager(privyUserId);

    assert.equal(first.manager_object_id, managerObjectId);
    assert.equal(second.manager_object_id, managerObjectId);

    const rows = await findBalanceManagerByPrivyUserId(privyUserId);
    assert.ok(rows);
    assert.equal(rows.manager_object_id, managerObjectId);
  });

  it("requires approval for deepbook deposit and withdraw actions", () => {
    assert.equal(
      transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "sui",
        action: "deepbook_deposit",
        params: { coin_key: "SUI", amount_display: 1 },
      }),
      true,
    );
    assert.equal(
      transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "sui",
        action: "deepbook_withdraw",
        params: { coin_key: "USDC", amount_display: 10 },
      }),
      true,
    );
  });
});
