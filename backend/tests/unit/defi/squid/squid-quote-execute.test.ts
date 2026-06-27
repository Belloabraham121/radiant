import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { resetChainConfigCacheForTests } from "../../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../../src/config/evm.js";
import {
  resolveSourceChainFromSquidExecuteInput,
  resolveSquidRouteForExecute,
} from "../../../../src/services/defi/squid/squid-quote.service.js";
import { assertSquidExecuteCorridorSupported } from "../../../../src/services/defi/squid/squid-approval.service.js";

const baseUsdcToEthRoute = {
  quoteId: "quote-base-swap",
  estimate: {
    fromAmount: "1500000",
    toAmount: "500000000000000",
  },
  params: {
    fromChain: "8453",
    toChain: "8453",
    fromAmount: "1500000",
  },
} as const;

describe("squid quote execute — embedded route evm chain ids", () => {
  beforeEach(() => {
    process.env.ENABLED_CHAINS = "ethereum";
    process.env.ENABLED_EVM_CHAIN_IDS = "8453";
    process.env.EVM_CHAIN_IDS = "8453";
    resetChainConfigCacheForTests();
    resetEvmConfigCacheForTests();
  });

  it("resolveSquidRouteForExecute fills evm ids from embedded Squid route params", async () => {
    const stored = await resolveSquidRouteForExecute({
      squidRoute: baseUsdcToEthRoute,
      snapshotParams: {
        from_chain_id: "ethereum",
        to_chain_id: "ethereum",
        from_token: "USDC",
        to_token: "ETH",
      },
    });

    assert.equal(stored.from_evm_chain_id, 8453);
    assert.equal(stored.to_evm_chain_id, 8453);
    assert.doesNotThrow(() => assertSquidExecuteCorridorSupported(stored));
  });

  it("resolveSourceChainFromSquidExecuteInput merges partial execute input with stored evm id", () => {
    const source = resolveSourceChainFromSquidExecuteInput({
      from_chain_id: "ethereum",
      stored: {
        route: baseUsdcToEthRoute,
        quote_id: "quote-base-swap",
        from_chain_id: "ethereum",
        to_chain_id: "ethereum",
        from_evm_chain_id: 8453,
        to_evm_chain_id: 8453,
        from_squid_chain_id: "8453",
        to_squid_chain_id: "8453",
      },
    });

    assert.deepEqual(source, { chain_id: "ethereum", evm_chain_id: 8453 });
  });
});
