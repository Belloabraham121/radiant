import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { clearMemoryCacheForTests } from "../../../../src/infrastructure/redis/cache.js";
import { getSquidChainflipDepositAddress } from "../../../../src/services/defi/squid/squid-deposit.service.js";
import { squidSdk, resetSquidClientForTests } from "../../../../src/services/defi/squid/squid.client.js";
import { SquidDataType } from "@0xsquid/squid-types";

describe("squid-deposit.service", () => {
  let originalRequestDepositAddress: typeof squidSdk.requestDepositAddress;

  afterEach(() => {
    squidSdk.requestDepositAddress = originalRequestDepositAddress;
    resetSquidClientForTests();
    clearMemoryCacheForTests();
    delete process.env.SQUID_INTEGRATOR_ID;
  });

  it("returns parsed deposit-address response from Squid SDK", async () => {
    process.env.SQUID_INTEGRATOR_ID = "radiant-test";
    originalRequestDepositAddress = squidSdk.requestDepositAddress;
    squidSdk.requestDepositAddress = async () => ({
      depositAddress: "35tWpkpFr7UawcpuXm6ir1nN1v5tfoJgKj84xv1YukZn",
      amount: "100000000",
      chainflipStatusTrackingId: "5994435-Solana-26351",
    });

    const route = {
      quoteId: "quote-chainflip",
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

    const result = await getSquidChainflipDepositAddress("user-1", {
      transactionRequest: route.transactionRequest,
      quoteId: "quote-chainflip",
      route,
    });

    assert.equal(result.depositAddress, "35tWpkpFr7UawcpuXm6ir1nN1v5tfoJgKj84xv1YukZn");
    assert.equal(result.amount, "100000000");
    assert.equal(result.chainflipStatusTrackingId, "5994435-Solana-26351");
  });
});
