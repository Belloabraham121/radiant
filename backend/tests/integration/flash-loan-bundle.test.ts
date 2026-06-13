import { Transaction } from "@mysten/sui/transactions";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppError } from "../../src/errors/app-error.js";
import { prisma } from "../../src/infrastructure/postgres/client.js";
import { getSuiClient, resetSuiClientForTests } from "../../src/infrastructure/sui/client.js";
import { defaultUserProfileFields } from "../../src/services/auth/user.repository.js";
import {
  getAgentPermissions,
  updateAgentPermissions,
} from "../../src/services/agent/agent-permissions.service.js";
import { recordPendingApproval } from "../../src/services/agent-transaction/agent-transaction.service.js";
import { parseDeepBookFlashLoanParams } from "../../src/services/defi/deepbook/deepbook-flash-loan.types.js";
import {
  buildFlashLoanPtb,
  validateFlashLoanBundle,
} from "../../src/services/defi/deepbook/deepbook-flash-loan-bundle.js";
import { getFlashLoanBundleQuote } from "../../src/services/defi/deepbook/deepbook-flash-loan-quote.js";
import { setRedisClientForTests } from "../../src/infrastructure/redis/client.js";
import {
  getSuiDeepBookClient,
  resetSuiDeepBookClientsForTests,
} from "../../src/services/defi/deepbook/providers/sui-deepbook.provider.js";

const privyUserId = "did:privy:flash-loan-integration";
const walletAddress =
  "0x0000000000000000000000000000000000000000000000000000000000f1a500";

describe("flash loan bundle integration", () => {
  before(async () => {
    await prisma.agentTransaction.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.agentWallet.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.agentWallet.deleteMany({
      where: { address: walletAddress },
    });
    await prisma.user.deleteMany({ where: { privy_user_id: privyUserId } });

    const user = await prisma.user.create({
      data: {
        privy_user_id: privyUserId,
        email: "flash-loan-integration@radiant.dev",
        ...defaultUserProfileFields(),
      },
    });

    await prisma.agentWallet.create({
      data: {
        user_id: user.id,
        chain_type: "sui",
        address: walletAddress,
        privy_wallet_id: "privy-wallet-flash-loan-integration",
        signer_added: true,
      },
    });

    await updateAgentPermissions(privyUserId, {
      allow_flash_loans: true,
      auto_approve_flash_loans: false,
    });
  });

  after(async () => {
    await prisma.agentTransaction.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.agentWallet.deleteMany({
      where: { user: { privy_user_id: privyUserId } },
    });
    await prisma.user.deleteMany({ where: { privy_user_id: privyUserId } });

    resetSuiDeepBookClientsForTests();
    resetSuiClientForTests();
    setRedisClientForTests(null);
    await prisma.$disconnect();
  });

  it("updateAgentPermissions persists auto_approve_flash_loans", async () => {
    const updated = await updateAgentPermissions(privyUserId, {
      auto_approve_flash_loans: true,
    });
    assert.equal(updated.auto_approve_flash_loans, true);

    const loaded = await getAgentPermissions(privyUserId);
    assert.equal(loaded.allow_flash_loans, true);
    assert.equal(loaded.auto_approve_flash_loans, true);
  });

  it("records deepbook_flash_loan as flash_loan category", async () => {
    const row = await recordPendingApproval({
      privyUserId,
      input: {
        chain_id: "sui",
        action: "deepbook_flash_loan",
        params: {
          pool_key: "SUI_USDC",
          borrow_amount: 1,
          asset: "base",
          strategy: "round_trip",
        },
      },
      pending: {
        id: "00000000-0000-4000-8000-000000000101",
        chain_id: "sui",
        action: "deepbook_flash_loan",
        params: {
          pool_key: "SUI_USDC",
          borrow_amount: 1,
          asset: "base",
          strategy: "round_trip",
        },
        summary: "DeepBook flash loan (SUI_USDC)",
        amount_display: "Borrow 1 SUI (SUI_USDC)",
      },
    });

    assert.equal(row.category, "flash_loan");
  });

  it("rejects same-pool base borrow and trade", () => {
    assert.throws(
      () =>
        parseDeepBookFlashLoanParams({
          pool_key: "SUI_USDC",
          borrow_amount: 5,
          asset: "base",
          strategy: "swap_chain_repay",
          steps: [{ pool_key: "SUI_USDC", side: "sell", amount: 5 }],
        }),
      (err: unknown) =>
        err instanceof AppError &&
        /Borrowing base and trading on the same pool/.test(err.message),
    );
  });

  it("dry-run composes round_trip flash loan PTB (transaction kind only)", async () => {
    const params = {
      pool_key: "SUI_USDC",
      borrow_amount: 1,
      asset: "base",
      strategy: "round_trip",
    };
    const parsed = parseDeepBookFlashLoanParams(params);
    await validateFlashLoanBundle(privyUserId, parsed);
    const quote = await getFlashLoanBundleQuote(privyUserId, params);

    const tx = new Transaction();
    tx.setSender(walletAddress);
    const extended = getSuiDeepBookClient({ address: walletAddress });
    buildFlashLoanPtb(tx, extended, walletAddress, parsed, quote);

    const bytes = await tx.build({
      client: getSuiClient(),
      onlyTransactionKind: true,
    });
    assert.ok(bytes.length > 0);
    assert.equal(parsed.strategy, "round_trip");
  });
});
