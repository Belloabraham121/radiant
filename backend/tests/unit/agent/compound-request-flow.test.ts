import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasPoolMarketQuery,
  isCompoundMarketAndSwapRequest,
  shouldFinalizeCompoundReply,
  shouldNudgePoolInfoBeforeSwap,
  userAskedMarketPrice,
} from "../../../src/services/agent/compound-request-flow.js";

describe("compound-request-flow", () => {
  const compoundMessage =
    "What's the SUI/USDC price on DeepBook? If it looks reasonable, swap 0.1 SUI to USDC.";

  it("detects compound market + swap requests", () => {
    assert.equal(isCompoundMarketAndSwapRequest(compoundMessage), true);
    assert.equal(userAskedMarketPrice(compoundMessage), true);
    assert.equal(isCompoundMarketAndSwapRequest("swap 1 SUI to USDC"), false);
  });

  it("shouldNudgePoolInfoBeforeSwap when price+swap but no pool query yet", () => {
    assert.equal(shouldNudgePoolInfoBeforeSwap([], compoundMessage), true);
    assert.equal(
      shouldNudgePoolInfoBeforeSwap(
        [
          {
            name: "query_chain",
            result: {
              pool_key: "SUI_USDC",
              base_coin: "SUI",
              quote_coin: "USDC",
              ticker: { last_price: 1.5 },
            },
          },
        ],
        compoundMessage,
      ),
      false,
    );
  });

  it("hasPoolMarketQuery recognizes deepbook_pool_info results", () => {
    assert.equal(
      hasPoolMarketQuery([
        {
          name: "query_chain",
          result: {
            pool_key: "SUI_USDC",
            base_coin: "SUI",
            quote_coin: "USDC",
            min_size_display: 1,
            lot_size_display: 0.1,
          },
        },
      ]),
      true,
    );
  });

  it("shouldFinalizeCompoundReply after pool info and execute error", () => {
    const toolCalls = [
      {
        name: "query_chain",
        result: {
          pool_key: "SUI_USDC",
          base_coin: "SUI",
          quote_coin: "USDC",
          ticker: { last_price: 1.48 },
        },
      },
      {
        name: "execute_transaction",
        result: {
          error: {
            code: "VALIDATION_ERROR",
            message: "Amount is too small after conversion",
          },
        },
      },
    ];

    assert.equal(
      shouldFinalizeCompoundReply(toolCalls, compoundMessage, {
        error: { code: "VALIDATION_ERROR", message: "Amount is too small after conversion" },
      }),
      true,
    );
  });
});
