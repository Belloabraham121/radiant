import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyFlashLoanTurnIntent,
  messageMentionsFlashLoan,
} from "../../../src/services/agent/deepbook/flash-loan-turn-intent.js";

describe("flash-loan-turn-intent", () => {
  it("detects flash loan mentions", () => {
    assert.equal(messageMentionsFlashLoan("Give me a flash loan strategy"), true);
    assert.equal(messageMentionsFlashLoan("flash borrow 10 SUI"), true);
    assert.equal(messageMentionsFlashLoan("swap 10 SUI to USDC"), false);
  });

  it("classifies strategy requests as research", () => {
    assert.equal(
      classifyFlashLoanTurnIntent(
        "give me a flash loan strategy with the 10,000 dollars worth in any token",
      ),
      "research",
    );
    assert.equal(
      classifyFlashLoanTurnIntent("recommend a flash loan route for 5000 USDC"),
      "research",
    );
  });

  it("classifies explicit execution requests", () => {
    assert.equal(
      classifyFlashLoanTurnIntent(
        "quote an 8000 USDC flash loan on SUI_USDC, then execute if feasible",
      ),
      "execution",
    );
    assert.equal(
      classifyFlashLoanTurnIntent(
        "flash borrow 10 SUI, swap to USDC, swap back, repay",
      ),
      "execution",
    );
  });

  it("returns null when flash loans are not mentioned", () => {
    assert.equal(classifyFlashLoanTurnIntent("what is my wallet balance"), null);
  });
});
