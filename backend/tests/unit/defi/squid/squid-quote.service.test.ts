import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetChainConfigCacheForTests } from "../../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../../src/config/evm.js";
import { resetSupportedTokensCacheForTests } from "../../../../src/config/supported-tokens.js";
import { clearMemoryCacheForTests } from "../../../../src/infrastructure/redis/cache.js";
import {
  fetchSquidRouteQuote,
  getSquidRoute,
} from "../../../../src/services/defi/squid/squid-quote.service.js";
import { squidSdk, resetSquidClientForTests } from "../../../../src/services/defi/squid/squid.client.js";
import { resolveSquidTokens } from "../../../../src/services/defi/squid/squid-input.js";

function enableSquidEnv(): void {
  process.env.SQUID_ENABLED = "true";
  process.env.SQUID_INTEGRATOR_ID = "radiant-test";
  process.env.ENABLED_CHAINS = "ethereum";
  process.env.ENABLED_EVM_CHAIN_IDS = "1,8453";
  process.env.EVM_CHAIN_IDS = "1,8453";
  process.env.EVM_RPC_URL_1 = "http://localhost:8545";
  process.env.EVM_RPC_URL_8453 = "http://localhost:8547";
  resetChainConfigCacheForTests();
  resetEvmConfigCacheForTests();
  resetSupportedTokensCacheForTests();
}

describe("squid-quote.service", () => {
  let originalGetRoute: typeof squidSdk.getRoute;

  afterEach(() => {
    squidSdk.getRoute = originalGetRoute;
    resetSquidClientForTests();
    clearMemoryCacheForTests();
    delete process.env.SQUID_ENABLED;
    delete process.env.SQUID_INTEGRATOR_ID;
  });

  it("fetchSquidRouteQuote returns normalized route with mocked SDK", async () => {
    enableSquidEnv();
    originalGetRoute = squidSdk.getRoute;
    squidSdk.getRoute = async () => ({
      route: {
        quoteId: "quote-mock",
        estimate: {
          fromAmount: "1000000",
          toAmount: "990000",
          estimatedRouteDuration: 120,
          actions: [{ provider: "squid" }],
        },
      },
      requestId: "req-mock",
    });

    const tokens = resolveSquidTokens({
      from_chain_id: "ethereum",
      from_evm_chain_id: 1,
      to_chain_id: "ethereum",
      to_evm_chain_id: 8453,
      fromToken: "USDC",
      toToken: "USDC",
      amountAtomic: "1000000",
      confirmSameToken: true,
    });

    const route = await fetchSquidRouteQuote({
      tokens,
      amountAtomic: "1000000",
      fromAddress: "0x0000000000000000000000000000000000000001",
      toAddress: "0x0000000000000000000000000000000000000001",
    });

    assert.equal(route.provider_id, "evm-squid");
    assert.match(route.route_id, /^squid:/);
    assert.equal(route.from_amount_atomic, "1000000");
    assert.equal(route.provider_payload.kind, "squid");
    if (route.provider_payload.kind === "squid") {
      assert.equal(route.provider_payload.quote_id, "quote-mock");
    }
  });

  it("getSquidRoute rejects when Squid is disabled", async () => {
    delete process.env.SQUID_ENABLED;
    await assert.rejects(
      getSquidRoute("user-1", {
        from_chain_id: "ethereum",
        from_evm_chain_id: 1,
        to_chain_id: "ethereum",
        to_evm_chain_id: 8453,
        from_token: "USDC",
        to_token: "USDC",
        amount_atomic: "1000000",
        confirm_same_token: true,
      }),
      (err: unknown) =>
        err instanceof Error && "code" in err && (err as { code: string }).code === "SQUID_UNAVAILABLE",
    );
  });
});
