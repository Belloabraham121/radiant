import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../src/config/evm.js";
import { resetSupportedTokensCacheForTests } from "../../../src/config/supported-tokens.js";
import type { PartialBridgeIntent } from "../../../src/services/agent/bridge/bridge-intent.types.js";
import {
  executeResolvedSquidBridgeIntent,
  setGetSquidRoutesForTests,
} from "../../../src/services/agent/squid-test/squid-execute.js";
import { normalizeSquidRouteOption } from "../../../src/services/defi/squid/squid-normalize.js";
import type { SquidRouteResponse } from "../../../src/services/defi/squid/squid.types.js";
import {
  setExecuteTransactionWithApprovalHandlerForTests,
} from "../../../src/services/agent/execute-transaction-with-approval.js";

const mockSquidResponse = {
  route: {
    quoteId: "quote-squid-test",
    estimate: {
      fromAmount: "100000000",
      toAmount: "99000000",
      estimatedRouteDuration: 120,
      gasCosts: [{ amountUsd: "1.00" }],
      feeCosts: [{ amountUsd: "0.50" }],
      actions: [{ provider: "axelar" }],
    },
    params: {
      fromAmount: "100000000",
    },
  },
  requestId: "req-squid-test",
} as unknown as SquidRouteResponse;

function enableTestEnv(): void {
  process.env.SQUID_ENABLED = "true";
  process.env.SQUID_INTEGRATOR_ID = "radiant-test";
  process.env.SQUID_INTENT_TEST_ENABLED = "true";
  process.env.ENABLED_CHAINS = "ethereum";
  process.env.ENABLED_EVM_CHAIN_IDS = "1,42161,8453";
  process.env.EVM_CHAIN_IDS = "1,42161,8453";
  process.env.EVM_RPC_URL_1 = "http://localhost:8545";
  process.env.EVM_RPC_URL_42161 = "http://localhost:8546";
  process.env.EVM_RPC_URL_8453 = "http://localhost:8547";
  resetChainConfigCacheForTests();
  resetEvmConfigCacheForTests();
  resetSupportedTokensCacheForTests();
}

const bridgeIntent: PartialBridgeIntent = {
  originalMessage: "squid bridge 100 USDC from ethereum to base",
  amount: 100,
  fromToken: "USDC",
  toToken: "USDC",
  fromChainId: "ethereum",
  fromEvmChainId: 1,
  toChainId: "ethereum",
  toEvmChainId: 8453,
  confirmSameToken: true,
};

describe("squid-execute — direct Squid route", () => {
  before(() => {
    enableTestEnv();
  });

  afterEach(() => {
    setGetSquidRoutesForTests(null);
    setExecuteTransactionWithApprovalHandlerForTests(null);
  });

  it("quotes via getSquidRoutes and returns approval pending", async () => {
    setGetSquidRoutesForTests(async () => {
      const route = normalizeSquidRouteOption({
        response: mockSquidResponse,
        from: { chain_id: "ethereum", evm_chain_id: 1 },
        to: { chain_id: "ethereum", evm_chain_id: 8453 },
        fromTokenSymbol: "USDC",
        toTokenSymbol: "USDC",
        routeId: "squid:deadbeefcafebabe",
      });
      return { routes: [route], unavailable_routes: null };
    });

    setExecuteTransactionWithApprovalHandlerForTests(async (_userId, input) => {
      assert.equal(input.action, "cross_chain_swap");
      assert.equal(input.params.provider_id, "evm-squid");
      return {
        status: "approval_required",
        pending: {
          id: "pending-squid-test",
          chain_id: "ethereum",
          evm_chain_id: 1,
          action: "cross_chain_swap",
          params: input.params,
          created_at: new Date().toISOString(),
        },
      };
    });

    const outcome = await executeResolvedSquidBridgeIntent("user-1", bridgeIntent, "session-1");
    assert.ok(outcome);
    assert.match(outcome!.reply, /approval/i);
    assert.equal(outcome!.pending_transaction?.id, "pending-squid-test");
    assert.equal(outcome!.tool_calls.length, 2);
    assert.equal(outcome!.tool_calls[0]?.query, "cross_chain_routes");
    assert.equal(outcome!.tool_calls[1]?.name, "execute_transaction");
  });

  it("returns user-friendly reply when Squid has no routes", async () => {
    setGetSquidRoutesForTests(async () => ({
      routes: [],
      unavailable_routes: null,
    }));

    const outcome = await executeResolvedSquidBridgeIntent("user-1", bridgeIntent);
    assert.ok(outcome);
    assert.match(outcome!.reply, /no squid routes/i);
    assert.equal(outcome!.pending_transaction, null);
  });
});
