import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetChainConfigCacheForTests } from "../../../src/config/chains.js";
import { AppError } from "../../../src/errors/app-error.js";
import { getAdapter, parseChainId, setAdapterForTests } from "../../../src/services/chains/registry.js";
import { evmAdapter } from "../../../src/services/chains/adapters/evm.js";
import { solanaAdapter } from "../../../src/services/chains/adapters/solana.js";
import { suiAdapter } from "../../../src/services/chains/adapters/sui.js";
import type { ChainAdapter } from "../../../src/services/chains/types.js";

describe("chains/registry", () => {
  afterEach(() => {
    resetChainConfigCacheForTests();
    setAdapterForTests("sui", suiAdapter);
    setAdapterForTests("ethereum", evmAdapter);
    setAdapterForTests("solana", solanaAdapter);
    setAdapterForTests("stellar", undefined);
  });

  it("getAdapter returns sui adapter when enabled", () => {
    const adapter = getAdapter("sui");
    assert.equal(adapter.chainId, "sui");
  });

  it("getAdapter throws for disabled chain", () => {
    assert.throws(
      () => getAdapter("ethereum"),
      (err: unknown) =>
        err instanceof AppError &&
        err.code === "CHAIN_NOT_ENABLED" &&
        err.statusCode === 400,
    );
  });

  it("getAdapter throws when adapter is not registered", () => {
    process.env.ENABLED_CHAINS = "ethereum";
    resetChainConfigCacheForTests();
    setAdapterForTests("ethereum", undefined);

    assert.throws(
      () => getAdapter("ethereum"),
      (err: unknown) =>
        err instanceof AppError &&
        err.code === "CHAIN_ADAPTER_MISSING" &&
        err.statusCode === 501,
    );

    delete process.env.ENABLED_CHAINS;
    resetChainConfigCacheForTests();
  });

  it("getAdapter returns registered adapter for enabled chain", () => {
    const stub: ChainAdapter = {
      chainId: "ethereum",
      getBalance: async () => {
        throw new Error("not implemented");
      },
      executeTransaction: async () => {
        throw new Error("not implemented");
      },
    };

    process.env.ENABLED_CHAINS = "ethereum";
    resetChainConfigCacheForTests();
    setAdapterForTests("ethereum", stub);

    const adapter = getAdapter("ethereum");
    assert.equal(adapter.chainId, "ethereum");

    delete process.env.ENABLED_CHAINS;
    resetChainConfigCacheForTests();
  });

  it("parseChainId rejects unknown values", () => {
    assert.throws(
      () => parseChainId("polygon"),
      (err: unknown) =>
        err instanceof AppError &&
        err.code === "CHAIN_NOT_SUPPORTED" &&
        err.statusCode === 400,
    );
  });
});
