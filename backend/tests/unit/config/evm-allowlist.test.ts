import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import {
  getEnabledEvmChainIds,
  resetEvmConfigCacheForTests,
  resolveEvmChainId,
} from "../../../src/config/evm.js";

describe("evm allowlist", () => {
  afterEach(() => {
    delete process.env.EVM_CHAIN_IDS;
    delete process.env.ENABLED_EVM_CHAIN_IDS;
    delete process.env.EVM_DEFAULT_CHAIN_ID;
    resetEvmConfigCacheForTests();
  });

  it("defaults ENABLED_EVM_CHAIN_IDS to Ethereum, Arbitrum, Base", () => {
    process.env.EVM_CHAIN_IDS = "1,42161,8453";
    resetEvmConfigCacheForTests();

    assert.deepEqual(getEnabledEvmChainIds(), [1, 42161, 8453]);
  });

  it("resolveEvmChainId rejects Polygon with CHAIN_NOT_ENABLED", () => {
    process.env.EVM_CHAIN_IDS = "1,137,42161,8453";
    resetEvmConfigCacheForTests();

    assert.throws(
      () => resolveEvmChainId(137),
      (err: unknown) =>
        err instanceof AppError &&
        err.code === "CHAIN_NOT_ENABLED" &&
        err.statusCode === 400,
    );
  });

  it("resolveEvmChainId accepts Base when in allowlist and configured", () => {
    process.env.EVM_CHAIN_IDS = "1,42161,8453";
    resetEvmConfigCacheForTests();

    assert.equal(resolveEvmChainId(8453), 8453);
  });

  it("filters configured networks to ENABLED_EVM_CHAIN_IDS", () => {
    process.env.EVM_CHAIN_IDS = "1,42161,8453";
    process.env.ENABLED_EVM_CHAIN_IDS = "1,8453";
    resetEvmConfigCacheForTests();

    assert.deepEqual(getEnabledEvmChainIds(), [1, 8453]);
  });
});
