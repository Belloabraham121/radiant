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

  it("routes swap insufficient balance to wallet-focused AI instructions", () => {
    const instructions = buildErrorExplanationInstructions({
      toolName: "execute_transaction",
      error: {
        code: "INSUFFICIENT_BALANCE",
        message: "You do not have enough of the required token.",
      },
      transactionContext: {
        action: "deepbook_swap",
        amount_display: "10000 SUI → ~7496 USDC",
      },
    });

    assert.match(instructions, /swap from the agent wallet/i);
    assert.doesNotMatch(instructions, /DeepBook balance manager funds, not the user's main wallet/i);
  });
});
