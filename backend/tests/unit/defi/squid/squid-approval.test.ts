import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SquidDataType } from "@0xsquid/squid-types";
import { readOnChainExecutionTarget } from "../../../../src/services/defi/squid/squid-execute-providers.service.js";
import type { SquidRouteSnapshot } from "../../../../src/services/defi/squid/squid.types.js";

describe("squid-approval helpers", () => {
  it("reads Squid router target for EVM approval spender", () => {
    const route = {
      quoteId: "quote-base",
      params: {
        fromChain: "8453",
        toChain: "8453",
        fromToken: "0x833589fCD6eDb6E08f4c7C32D6f84b0aE40e2B64",
        toToken: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        fromAmount: "1500000",
      },
      transactionRequest: {
        type: SquidDataType.OnChainExecution,
        routeType: "SWAP",
        target: "0xce16F69375520ab01377ce7B88f5BA8C48F8D666",
        data: "0x",
        value: "0",
      },
    } as SquidRouteSnapshot;

    assert.equal(
      readOnChainExecutionTarget(route),
      "0xce16F69375520ab01377ce7B88f5BA8C48F8D666",
    );
  });
});
