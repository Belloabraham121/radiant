import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeErrorMessageForUi } from "../../../src/services/agent-transaction/sanitize-error-message.js";

describe("sanitizeErrorMessageForUi", () => {
  it("keeps a single-line user-facing message", () => {
    assert.equal(
      sanitizeErrorMessageForUi("You do not have enough SUI."),
      "You do not have enough SUI.",
    );
  });

  it("uses the first non-stack line from multiline errors", () => {
    assert.equal(
      sanitizeErrorMessageForUi("Error: Move abort\n    at processTicksAndRejections"),
      "Move abort",
    );
  });

  it("truncates very long messages", () => {
    const long = "x".repeat(600);
    assert.equal(sanitizeErrorMessageForUi(long).length, 500);
  });

  it("falls back when input is empty", () => {
    assert.equal(sanitizeErrorMessageForUi(""), "Transaction failed");
  });

  it("sanitizes Li-Fi SDK TransactionError blobs", () => {
    assert.equal(
      sanitizeErrorMessageForUi(
        "[TransactionError] Transaction failed: [object Object]\nLI.FI SDK version: 4.0.1",
      ),
      "The bridge transaction failed on chain. Check your wallet balance and try again.",
    );
  });
});
