import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { User } from "@privy-io/node";
import { prisma } from "../../../src/infrastructure/postgres/client.js";
import {
  handleTransferredAccount,
  syncUserEmailFromPrivyUser,
} from "../../../src/services/auth/user.service.js";

function privyUser(
  id: string,
  email: string,
  type: "google_oauth" | "github_oauth" | "email" = "google_oauth",
): User {
  const linkedAccount =
    type === "email"
      ? { type: "email" as const, address: email, verified_at: Date.now() }
      : type === "github_oauth"
        ? {
            type: "github_oauth" as const,
            subject: `gh-${id}`,
            email,
            username: "dev",
            name: "Dev",
          }
        : {
            type: "google_oauth" as const,
            subject: `go-${id}`,
            email,
            name: "Dev",
          };

  return {
    id,
    created_at: Date.now(),
    linked_accounts: [linkedAccount],
    mfa_methods: [],
    has_accepted_terms: true,
    is_guest: false,
  } as User;
}

describe("shared identity user merge", () => {
  const survivorId = "did:privy:survivor-merge-test";
  const orphanId = "did:privy:orphan-merge-test";
  const sharedEmail = "merge-test@radiant.dev";

  before(async () => {
    await prisma.user.deleteMany({
      where: { privy_user_id: { in: [survivorId, orphanId] } },
    });
  });

  after(async () => {
    await prisma.user.deleteMany({
      where: { privy_user_id: { in: [survivorId, orphanId] } },
    });
    await prisma.$disconnect();
  });

  it("moves orphan agent wallets to survivor and deletes orphan user", async () => {
    const survivor = await prisma.user.create({
      data: {
        privy_user_id: survivorId,
        email: sharedEmail,
        agent_wallets: {
          create: {
            chain_type: "sui",
            address: `0x${"a".repeat(64)}`,
            privy_wallet_id: "wallet-survivor-sui",
            signer_added: true,
          },
        },
      },
      include: { agent_wallets: true },
    });

    await prisma.user.create({
      data: {
        privy_user_id: orphanId,
        email: "orphan@radiant.dev",
        agent_wallets: {
          create: {
            chain_type: "ethereum",
            address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            privy_wallet_id: "wallet-orphan-evm",
            signer_added: true,
          },
        },
      },
      include: { agent_wallets: true },
    });

    await handleTransferredAccount({
      fromPrivyUserId: orphanId,
      survivorPrivyUser: privyUser(survivorId, sharedEmail, "github_oauth"),
    });

    const remainingOrphan = await prisma.user.findUnique({
      where: { privy_user_id: orphanId },
    });
    assert.equal(remainingOrphan, null);

    const updatedSurvivor = await prisma.user.findUnique({
      where: { privy_user_id: survivorId },
      include: { agent_wallets: true },
    });
    assert.ok(updatedSurvivor);
    assert.equal(updatedSurvivor.agent_wallets.length, 2);
    assert.ok(
      updatedSurvivor.agent_wallets.some((wallet) => wallet.chain_type === "sui"),
    );
    assert.ok(
      updatedSurvivor.agent_wallets.some((wallet) => wallet.chain_type === "ethereum"),
    );

    const orphanWalletStillExists = await prisma.agentWallet.findUnique({
      where: { privy_wallet_id: "wallet-orphan-evm" },
    });
    assert.ok(orphanWalletStillExists);
    assert.equal(orphanWalletStillExists.user_id, survivor.id);
  });

  it("syncUserEmailFromPrivyUser updates normalized email", async () => {
    const syncUserId = "did:privy:sync-email-test";
    await prisma.user.deleteMany({ where: { privy_user_id: syncUserId } });
    await prisma.user.create({
      data: {
        privy_user_id: syncUserId,
        email: "old@radiant.dev",
      },
    });

    await syncUserEmailFromPrivyUser(
      privyUser(syncUserId, "NEW@Radiant.Dev", "email"),
    );

    const updated = await prisma.user.findUnique({
      where: { privy_user_id: syncUserId },
    });
    assert.equal(updated?.email, "new@radiant.dev");

    await prisma.user.deleteMany({ where: { privy_user_id: syncUserId } });
  });
});
