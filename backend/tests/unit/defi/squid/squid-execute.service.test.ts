import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetChainConfigCacheForTests } from "../../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../../src/config/evm.js";
import { clearMemoryCacheForTests } from "../../../../src/infrastructure/redis/cache.js";
import { assertSquidRouteExecutable } from "../../../../src/services/defi/squid/squid-execute-providers.service.js";
import { storeSquidRoute } from "../../../../src/services/defi/squid/squid-cache.js";
import { resetSquidClientForTests } from "../../../../src/services/defi/squid/squid.client.js";
import type { SquidStoredRoutePayload } from "../../../../src/services/defi/squid/squid.types.js";
import { SquidDataType } from "@0xsquid/squid-types";

function enableSquidEnv(chains = "ethereum"): void {
  process.env.SQUID_ENABLED = "true";
  process.env.SQUID_INTEGRATOR_ID = "radiant-test";
  process.env.ENABLED_CHAINS = chains;
  process.env.ENABLED_EVM_CHAIN_IDS = "1,8453,42161";
  process.env.EVM_CHAIN_IDS = "1,8453,42161";
  process.env.EVM_RPC_URL_1 = "http://localhost:8545";
  process.env.EVM_RPC_URL_8453 = "http://localhost:8547";
  process.env.EVM_RPC_URL_42161 = "http://localhost:8548";
  resetChainConfigCacheForTests();
  resetEvmConfigCacheForTests();
}

const EVM = "0x1111111111111111111111111111111111111111";

describe("squid-execute.service", () => {
  afterEach(() => {
    resetSquidClientForTests();
    clearMemoryCacheForTests();
    delete process.env.SQUID_ENABLED;
    delete process.env.SQUID_INTEGRATOR_ID;
  });

  it("rejects when Squid is disabled", async () => {
    delete process.env.SQUID_ENABLED;
    const { executeSquidCrossChainSwap } = await import(
      "../../../../src/services/defi/squid/squid-execute.service.js"
    );
    await assert.rejects(
      executeSquidCrossChainSwap("user-1", { route_id: "squid:abc" }),
      (err: unknown) =>
        err instanceof Error && "code" in err && (err as { code: string }).code === "SQUID_UNAVAILABLE",
    );
  });

  it("rejects EVM CHAINFLIP deposit-address routes (Bitcoin deferred)", async () => {
    enableSquidEnv();
    const { executeSquidCrossChainSwap } = await import(
      "../../../../src/services/defi/squid/squid-execute.service.js"
    );
    const routeId = "squid:chainflip-evm-test";
    const stored: SquidStoredRoutePayload = {
      route: {
        quoteId: "quote-chainflip",
        params: {
          fromChain: "1",
          toChain: "8453",
          fromToken: "0xusdc",
          toToken: "0xusdc",
          fromAmount: "1000000",
        },
        transactionRequest: {
          type: SquidDataType.ChainflipDepositAddress,
          request: {
            quote: {},
            amount: "1000000",
            toAddress: EVM,
            fillOrKillParams: {
              minPrice: "1",
              refundAddress: EVM,
              retryDurationBlocks: 100,
            },
          },
        },
      },
      quote_id: "quote-chainflip",
      from_chain_id: "ethereum",
      to_chain_id: "ethereum",
      from_evm_chain_id: 1,
      to_evm_chain_id: 8453,
      from_squid_chain_id: "1",
      to_squid_chain_id: "8453",
    };
    await storeSquidRoute(routeId, stored);

    await assert.rejects(
      executeSquidCrossChainSwap("user-1", {
        route_id: routeId,
        from_chain_id: "ethereum",
        from_evm_chain_id: 1,
        to_chain_id: "ethereum",
        to_evm_chain_id: 8453,
        from_token: "USDC",
        to_token: "USDC",
        from_amount_atomic: "1000000",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
      (err: unknown) =>
        err instanceof Error && "code" in err && (err as { code: string }).code === "SQUID_VALIDATION_ERROR",
    );
  });

  it("allows Solana CHAINFLIP routes at validation gate", () => {
    const route = {
      quoteId: "quote-sol-chainflip",
      params: {
        fromChain: "solana-mainnet-beta",
        toChain: "8453",
        fromToken: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        toToken: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        fromAmount: "100000000",
      },
      transactionRequest: {
        type: SquidDataType.ChainflipDepositAddress,
        request: { quote: {} },
      },
    };

    assert.doesNotThrow(() => assertSquidRouteExecutable(route, "solana"));
  });

  it("rejects stellar corridor at execute time", async () => {
    enableSquidEnv("stellar,ethereum");
    const { executeSquidCrossChainSwap } = await import(
      "../../../../src/services/defi/squid/squid-execute.service.js"
    );

    const routeId = "squid:stellar-test";
    const stored: SquidStoredRoutePayload = {
      route: {
        quoteId: "quote-stellar",
        params: {
          fromChain: "stellar-mainnet",
          toChain: "1",
          fromToken: "native",
          toToken: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          fromAmount: "10000000",
        },
        transactionRequest: {
          type: SquidDataType.OnChainExecution,
          routeType: "BRIDGE",
          target: "0xrouter",
          data: "0x",
          value: "0",
        },
      },
      quote_id: "quote-stellar",
      from_chain_id: "stellar",
      to_chain_id: "ethereum",
      to_evm_chain_id: 1,
      from_squid_chain_id: "stellar-mainnet",
      to_squid_chain_id: "1",
    };
    await storeSquidRoute(routeId, stored);

    await assert.rejects(
      executeSquidCrossChainSwap("user-1", {
        route_id: routeId,
        from_chain_id: "stellar",
        to_chain_id: "ethereum",
        to_evm_chain_id: 1,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
      (err: unknown) =>
        err instanceof Error && "code" in err && (err as { code: string }).code === "SQUID_VALIDATION_ERROR",
    );
  });
});
