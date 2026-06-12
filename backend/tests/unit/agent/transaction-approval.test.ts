import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearPendingTransactionsForTests,
  createPendingTransaction,
  transferRequiresApproval,
} from "../../../src/services/agent/transaction-approval.service.js";

describe("transaction approval", () => {
  it("auto-approves transfers at or below default SUI threshold", () => {
    assert.equal(
      transferRequiresApproval({
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
      transferRequiresApproval({
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

  it("creates pending transaction records", () => {
    clearPendingTransactionsForTests();
    const pending = createPendingTransaction("did:privy:test", {
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
