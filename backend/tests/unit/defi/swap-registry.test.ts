import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import {
  getDefaultSwapProvider,
  getProviderForSwap,
  getSwapProvider,
} from "../../../src/services/defi/swap-registry.js";
import { toStellarBalanceResult } from "../../../src/services/chains/adapters/stellar-balance.js";

describe("swap-registry", () => {
  it("registers sui-deepbook as default Sui provider", () => {
    const provider = getSwapProvider("sui-deepbook");
    assert.equal(provider.chain_id, "sui");
    assert.equal(provider.label, "DeepBook V3");

    const defaultProvider = getDefaultSwapProvider("sui");
    assert.ok(defaultProvider);
    assert.equal(defaultProvider?.id, "sui-deepbook");
  });

  it("routes same-chain EVM swaps to SushiSwap", () => {
    const provider = getProviderForSwap({ chain_id: "ethereum", cross_chain: false });
    assert.equal(provider.id, "evm-sushiswap");
  });

  it("routes cross-chain EVM bridges to Li-Fi", () => {
    const provider = getProviderForSwap({ chain_id: "ethereum", cross_chain: true });
    assert.equal(provider.id, "evm-lifi");
  });

  it("routes Stellar swaps to Soroswap", () => {
    const provider = getProviderForSwap({ chain_id: "stellar" });
    assert.equal(provider.id, "stellar-soroswap");
  });

  it("rejects cross-ecosystem stellar to ethereum", () => {
    assert.throws(
      () =>
        getProviderForSwap({
          chain_id: "stellar",
          from_chain_id: "stellar",
          to_chain_id: "ethereum",
        }),
      (err: unknown) =>
        err instanceof AppError && err.code === "CROSS_ECOSYSTEM_NOT_SUPPORTED",
    );
  });
});

describe("stellar balance mapper", () => {
  it("maps stroops to BalanceResult", () => {
    const result = toStellarBalanceResult({
      address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      balanceStroops: 25_000_000n,
      balanceXlm: 2.5,
      funded: true,
    });

    assert.equal(result.chain_id, "stellar");
    assert.equal(result.balance_atomic, "25000000");
    assert.equal(result.native_symbol, "XLM");
    assert.equal(result.funded, true);
  });
});
