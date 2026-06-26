import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetChainConfigCacheForTests } from "../../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../../src/config/evm.js";
import { clearMemoryCacheForTests } from "../../../../src/infrastructure/redis/cache.js";
import { executeSquidCrossChainSwap } from "../../../../src/services/defi/squid/squid-execute.service.js";
import { squidSdk, resetSquidClientForTests } from "../../../../src/services/defi/squid/squid.client.js";
import { storeSquidRoute } from "../../../../src/services/defi/squid/squid-cache.js";
import type { SquidStoredRoutePayload } from "../../../../src/services/defi/squid/squid.types.js";
import { SquidDataType } from "@0xsquid/squid-types";

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
}

describe("squid-execute.service", () => {
  afterEach(() => {
    resetSquidClientForTests();
    clearMemoryCacheForTests();
    delete process.env.SQUID_ENABLED;
    delete process.env.SQUID_INTEGRATOR_ID;
  });

  it("rejects when Squid is disabled", async () => {
    delete process.env.SQUID_ENABLED;
    await assert.rejects(
      executeSquidCrossChainSwap("user-1", { route_id: "squid:abc" }),
      (err: unknown) =>
        err instanceof Error && "code" in err && (err as { code: string }).code === "SQUID_UNAVAILABLE",
    );
  });

  it("rejects CHAINFLIP deposit-address routes before signing", async () => {
    enableSquidEnv();
    const routeId = "squid:chainflip-test";
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

  it("rejects stellar corridor at execute time", async () => {
    enableSquidEnv();
    process.env.ENABLED_CHAINS = "stellar,ethereum";
    resetChainConfigCacheForTests();

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

const EVM = "0x1111111111111111111111111111111111111111";
