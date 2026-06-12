import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildErrorExplanationInstructions } from "../../../src/services/agent/runtime/error-explanation.js";

describe("error-explanation", () => {
  it("routes deepbook_withdraw insufficient balance to manager-focused AI instructions", () => {
    const instructions = buildErrorExplanationInstructions({
      toolName: "execute_transaction",
      error: {
        code: "INSUFFICIENT_BALANCE",
        message:
          "Your DeepBook balance manager has 1 SUI, which is not enough to withdraw 500 SUI.",
      },
      transactionContext: {
        action: "deepbook_withdraw",
        coin_key: "SUI",
        amount_display: "500 SUI",
      },
      userContext: "I clicked Approve on a pending transaction in the app.",
    });

    assert.match(instructions, /DeepBook balance manager/i);
    assert.match(instructions, /not the user's main wallet/i);
    assert.doesNotMatch(instructions, /Try a smaller swap/i);
  });

  it("adds compound-reply instructions for price+swap failures", () => {
    const instructions = buildErrorExplanationInstructions({
      toolName: "execute_transaction",
      error: {
        code: "VALIDATION_ERROR",
        message: "Amount is too small after conversion",
      },
      compoundRequest: true,
      transactionContext: {
        action: "swap",
        amount_display: "0.1 SUI → USDC",
      },
    });

    assert.match(instructions, /MULTIPLE things/i);
    assert.match(instructions, /Answer every informational question first/i);
    assert.match(instructions, /min_size|lot_size/i);
  });
});
