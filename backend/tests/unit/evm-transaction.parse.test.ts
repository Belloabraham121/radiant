import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../src/errors/app-error.js";
import {
  parseAmountWei,
  parseEvmChainIdParam,
  parseEvmRecipient,
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
