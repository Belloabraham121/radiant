import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultAgentPermissions } from "../../../src/services/agent/agent-permissions.service.js";
import {
  buildPendingTransactionPreview,
  createPendingTransaction,
  rejectPendingTransaction,
  transferRequiresApprovalWithPermissions,
} from "../../../src/services/agent/transaction-approval.service.js";

describe("transaction approval", () => {
  it("auto-approves transfers at or below default SUI threshold", () => {
    assert.equal(
      transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "sui",
        action: "transfer_native",
        params: {
          recipient:
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          amount_atomic: String(25n * 1_000_000_000n),
        },
      }),
      false,
    );
  });

  it("requires approval above default SUI threshold", () => {
    assert.equal(
      transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "sui",
        action: "transfer_native",
        params: {
          recipient:
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          amount_atomic: String(25n * 1_000_000_000n + 1n),
        },
      }),
      true,
    );
  });

  it("requires approval for execute_bytes when auto-approve is disabled", () => {
    assert.equal(
      transferRequiresApprovalWithPermissions(
        { auto_approve_enabled: false, auto_approve_max_sui: 25 },
        {
          chain_id: "sui",
          action: "execute_bytes",
          params: { transaction_bytes: "abcd" },
        },
      ),
      true,
    );
  });

  it("requires approval for every transfer when auto-approve is disabled", () => {
    assert.equal(
      transferRequiresApprovalWithPermissions(
        { auto_approve_enabled: false, auto_approve_max_sui: 25 },
        {
          chain_id: "sui",
          action: "transfer_native",
          params: {
            recipient:
              "0x0000000000000000000000000000000000000000000000000000000000000001",
            amount_atomic: "1000000",
          },
        },
      ),
      true,
    );
  });

  it("uses custom max SUI threshold when auto-approve is enabled", () => {
    const permissions = { auto_approve_enabled: true, auto_approve_max_sui: 100 };
    assert.equal(
      transferRequiresApprovalWithPermissions(permissions, {
        chain_id: "sui",
        action: "transfer_native",
        params: {
          recipient:
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          amount_atomic: String(50n * 1_000_000_000n),
        },
      }),
      false,
    );
    assert.equal(
      transferRequiresApprovalWithPermissions(permissions, {
        chain_id: "sui",
        action: "transfer_native",
        params: {
          recipient:
            "0x0000000000000000000000000000000000000000000000000000000000000001",
          amount_atomic: String(101n * 1_000_000_000n),
        },
      }),
      true,
    );
  });

  it("creates pending provision manager with gas-only display", async () => {
    const pending = await buildPendingTransactionPreview("did:privy:test", {
      chain_id: "sui",
      action: "deepbook_provision_manager",
      params: {},
    });

    assert.match(pending.summary, /Create DeepBook balance manager/i);
    assert.match(pending.amount_display, /Network fee only/i);
  });

  it("provision manager always requires approval when auto-approve is on", () => {
    assert.equal(
      transferRequiresApprovalWithPermissions(defaultAgentPermissions(), {
        chain_id: "sui",
        action: "deepbook_provision_manager",
        params: {},
      }),
      true,
    );
  });

  it("rejects deposit pending without amount", async () => {
    await assert.rejects(
      () =>
        createPendingTransaction("did:privy:test", {
          chain_id: "sui",
          action: "deepbook_deposit",
          params: { coin_key: "SUI" },
        }),
      /VALIDATION_ERROR|amount/i,
    );
  });

  it("builds pending transfer preview", async () => {
    const pending = await buildPendingTransactionPreview("did:privy:test", {
      chain_id: "sui",
      action: "transfer_native",
      params: {
        recipient:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        amount_atomic: String(30n * 1_000_000_000n),
      },
    });

    assert.ok(pending.id);
    assert.match(pending.summary, /Send/);
  });
});
