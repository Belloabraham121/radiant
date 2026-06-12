import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseExecuteTransactionInput } from "../../../src/services/chains/execute-transaction.js";

describe("execute-transaction", () => {
  it("parseExecuteTransactionInput validates chain-agnostic shape", () => {
    const parsed = parseExecuteTransactionInput({
      chain_id: "sui",
      action: "transfer_native",
      params: {
        recipient:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        amount_atomic: "1000000",
      },
    });

    assert.equal(parsed.chain_id, "sui");
    assert.equal(parsed.action, "transfer_native");
    assert.equal(parsed.params.amount_atomic, "1000000");
  });

  it("parseExecuteTransactionInput rejects missing action", () => {
    assert.throws(() =>
      parseExecuteTransactionInput({
        chain_id: "sui",
        action: "",
        params: {},
      }),
    );
  });
});
