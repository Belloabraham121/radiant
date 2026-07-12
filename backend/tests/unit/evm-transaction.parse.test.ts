import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../src/errors/app-error.js";
import {
  parseAmountWei,
  parseDisplayAmountToAtomic,
  parseEvmChainIdParam,
  parseEvmRecipient,
  parseTokenAmountAtomic,
  readOptionalEvmChainIdParam,
} from "../../src/services/wallet/evm-transaction.service.js";

describe("evm-transaction param parsing", () => {
  it("parseEvmRecipient accepts recipient or to", () => {
    const address = "0x" + "a".repeat(40);
    assert.equal(parseEvmRecipient({ recipient: address }), address);
    assert.equal(parseEvmRecipient({ to: address }), address);
  });

  it("parseEvmRecipient rejects invalid address", () => {
    assert.throws(
      () => parseEvmRecipient({ recipient: "not-an-address" }),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
  });

  it("parseAmountWei accepts amount_wei or amount_atomic", () => {
    assert.equal(parseAmountWei({ amount_wei: "1000" }), 1000n);
    assert.equal(parseAmountWei({ amount_atomic: "42" }), 42n);
  });

  it("parseAmountWei falls back to amount_display in ETH", () => {
    assert.equal(parseAmountWei({ amount_display: 0.001 }), 1_000_000_000_000_000n);
    assert.equal(parseAmountWei({ amount_display: "1.5" }), 1_500_000_000_000_000_000n);
    assert.equal(parseAmountWei({ amount_eth: "0.25" }), 250_000_000_000_000_000n);
  });

  it("parseAmountWei rejects missing or invalid amounts", () => {
    assert.throws(
      () => parseAmountWei({}),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
    assert.throws(
      () => parseAmountWei({ amount_wei: "0" }),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
    assert.throws(
      () => parseAmountWei({ amount_display: -1 }),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
  });

  it("parseTokenAmountAtomic prefers atomic string, then display units", () => {
    assert.equal(parseTokenAmountAtomic({ amount_atomic: "5000000" }, 6), 5_000_000n);
    assert.equal(parseTokenAmountAtomic({ amount_display: 5 }, 6), 5_000_000n);
    assert.equal(parseTokenAmountAtomic({ amount_display: "2.5" }, 6), 2_500_000n);
    assert.equal(parseTokenAmountAtomic({ amount: "1,000" }, 6), 1_000_000_000n);
  });

  it("parseTokenAmountAtomic rejects zero and malformed amounts", () => {
    assert.throws(
      () => parseTokenAmountAtomic({}, 6),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
    assert.throws(
      () => parseTokenAmountAtomic({ amount_display: "abc" }, 6),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
    assert.throws(
      () => parseTokenAmountAtomic({ amount_display: 0 }, 6),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
  });

  it("parseDisplayAmountToAtomic keeps decimal precision", () => {
    assert.equal(parseDisplayAmountToAtomic("1.000001", 6), 1_000_001n);
    assert.equal(parseDisplayAmountToAtomic(0.1, 18), 100_000_000_000_000_000n);
    assert.equal(parseDisplayAmountToAtomic("not-a-number", 6), null);
    assert.equal(parseDisplayAmountToAtomic("-3", 6), null);
  });

  it("parseEvmChainIdParam returns undefined when omitted", () => {
    assert.equal(parseEvmChainIdParam({}), undefined);
  });

  it("parseEvmChainIdParam parses numeric chain id", () => {
    assert.equal(parseEvmChainIdParam({ evm_chain_id: 8453 }), 8453);
    assert.equal(parseEvmChainIdParam({ evm_chain_id: "137" }), 137);
  });

  it("readOptionalEvmChainIdParam reads from_evm_chain_id", () => {
    assert.equal(readOptionalEvmChainIdParam({ from_evm_chain_id: 8453 }), 8453);
    assert.equal(readOptionalEvmChainIdParam({ evm_chain_id: 42161 }), 42161);
    assert.equal(readOptionalEvmChainIdParam({}), undefined);
  });
});
