import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { PrivyClient } from "@privy-io/node";
import { setPrivyClientForTests } from "../../../src/infrastructure/privy/client.js";
import { assertPrivyWalletOwnership } from "../../../src/services/wallet/privy-wallet-ownership.service.js";

describe("assertPrivyWalletOwnership", () => {
  it("rejects when linked account wallet id does not match user", async () => {
    const privyUserId = "did:privy:test-user";
    const walletId = "wallet-owned-by-other";
    const address = `0x${"b".repeat(64)}`;

    const mockClient = {
      wallets: () => ({
        get: mock.fn(async () => ({
          id: walletId,
          address,
          chain_type: "sui",
          additional_signers: [],
          created_at: 0,
          exported_at: null,
          imported_at: null,
          owner_id: null,
          policy_ids: [],
          public_key: "pk",
        })),
      }),
      users: () => ({
        _get: mock.fn(async () => ({
          id: privyUserId,
          linked_accounts: [],
        })),
      }),
    } as unknown as PrivyClient;

    setPrivyClientForTests(mockClient);

    try {
      await assert.rejects(
        () =>
          assertPrivyWalletOwnership(privyUserId, {
            chain_type: "sui",
            privy_wallet_id: walletId,
            address,
            signer_added: false,
          }),
        (err: Error & { code?: string }) => {
          assert.equal(err.code, "WALLET_OWNERSHIP_MISMATCH");
          return true;
        },
      );
    } finally {
      setPrivyClientForTests(undefined);
    }
  });

  it("accepts when embedded wallet is linked to the user", async () => {
    const privyUserId = "did:privy:test-user";
    const walletId = "wallet-owned";
    const address = `0x${"c".repeat(64)}`;

    const mockClient = {
      wallets: () => ({
        get: mock.fn(async () => ({
          id: walletId,
          address,
          chain_type: "sui",
          additional_signers: [],
          created_at: 0,
          exported_at: null,
          imported_at: null,
          owner_id: null,
          policy_ids: [],
          public_key: "pk",
        })),
      }),
      users: () => ({
        _get: mock.fn(async () => ({
          id: privyUserId,
          linked_accounts: [
            {
              type: "wallet",
              connector_type: "embedded",
              id: walletId,
              address,
              chain_type: "sui",
            },
          ],
        })),
      }),
    } as unknown as PrivyClient;

    setPrivyClientForTests(mockClient);

    try {
      await assertPrivyWalletOwnership(privyUserId, {
        chain_type: "sui",
        privy_wallet_id: walletId,
        address,
        signer_added: false,
      });
    } finally {
      setPrivyClientForTests(undefined);
    }
  });
});
