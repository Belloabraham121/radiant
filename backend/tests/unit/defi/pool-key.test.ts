import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getDeepBookEnv, resetDeepBookEnvForTests } from "../../../src/config/deepbook.js";
import {
  coinsMatchForPool,
  resolvePoolKeyForCoinPair,
  resolveSwapPoolKey,
} from "../../../src/services/defi/deepbook/pool-key.js";
import { parseSwapExecutionIntent } from "../../../src/services/agent/execution-intent.js";

describe("pool-key resolution", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    resetDeepBookEnvForTests();
  });

  it("maps USDC to DBUSDC on testnet for SUI pairs", () => {
    process.env.SUI_NETWORK = "testnet";
    process.env.DEEPBOOK_DEFAULT_POOL = "SUI_USDC";
    resetDeepBookEnvForTests();

    assert.equal(coinsMatchForPool("USDC", "DBUSDC"), true);
    assert.equal(resolvePoolKeyForCoinPair("SUI", "USDC"), "SUI_DBUSDC");
    assert.equal(
      resolveSwapPoolKey({ fromCoin: "SUI", toCoin: "USDC" }),
      "SUI_DBUSDC",
    );
  });

  it("falls back from invalid DEEPBOOK_DEFAULT_POOL override on testnet", () => {
    process.env.SUI_NETWORK = "testnet";
    process.env.DEEPBOOK_DEFAULT_POOL = "SUI_USDC";
    resetDeepBookEnvForTests();

    assert.equal(getDeepBookEnv().defaultPool, "SUI_DBUSDC");
  });

  it("parses swap 1.5 sui to usdc with correct pool on testnet", () => {
    process.env.SUI_NETWORK = "testnet";
    resetDeepBookEnvForTests();

    const intent = parseSwapExecutionIntent("swap 1.5 sui to usdc");
    assert.ok(intent);
    assert.equal(intent?.amount, 1.5);
    assert.equal(intent?.from_coin, "SUI");
    assert.equal(intent?.to_coin, "USDC");
    assert.equal(intent?.pool_key, "SUI_DBUSDC");
    assert.equal(intent?.side, "sell");
  });
});
