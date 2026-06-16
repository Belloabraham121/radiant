import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetDeepBookEnvForTests } from "../../../src/config/deepbook.js";
import { resolveMarginPoolCoinKey } from "../../../src/services/defi/deepbook/margin-pool-coin-key.js";
import { AppError } from "../../../src/errors/app-error.js";

describe("resolveMarginPoolCoinKey", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    resetDeepBookEnvForTests();
  });

  it("resolves mainnet USDC margin pool coin key", () => {
    process.env.DEEPBOOK_ENV = "mainnet";
    resetDeepBookEnvForTests();

    assert.equal(resolveMarginPoolCoinKey("USDC"), "USDC");
    assert.equal(resolveMarginPoolCoinKey("usdc"), "USDC");
  });

  it("maps USDC to DBUSDC on testnet", () => {
    process.env.DEEPBOOK_ENV = "testnet";
    resetDeepBookEnvForTests();

    assert.equal(resolveMarginPoolCoinKey("USDC"), "DBUSDC");
    assert.equal(resolveMarginPoolCoinKey("DBUSDC"), "DBUSDC");
  });

  it("rejects trading pool keys as coin_type", () => {
    process.env.DEEPBOOK_ENV = "mainnet";
    resetDeepBookEnvForTests();

    assert.throws(
      () => resolveMarginPoolCoinKey("SUI_USDC"),
      (err: unknown) => err instanceof AppError && err.code === "VALIDATION_ERROR",
    );
  });

  it("rejects unknown margin pool assets", () => {
    process.env.DEEPBOOK_ENV = "mainnet";
    resetDeepBookEnvForTests();

    assert.throws(
      () => resolveMarginPoolCoinKey("FAKECOIN"),
      (err: unknown) => err instanceof AppError && err.code === "INVALID_MARGIN_POOL_COIN",
    );
  });
});
