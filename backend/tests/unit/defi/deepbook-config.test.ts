import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  DEFAULT_BALANCE_MANAGER_KEY,
  getDeepBookEnv,
  resetDeepBookEnvForTests,
} from "../../../src/config/deepbook.js";

describe("deepbook config", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    resetDeepBookEnvForTests();
  });

  it("defaults to mainnet SUI_USDC pool and SDK coin/pool maps", () => {
    delete process.env.DEEPBOOK_ENV;
    delete process.env.DEEPBOOK_DEFAULT_POOL;
    process.env.SUI_RPC_URL = "https://fullnode.mainnet.sui.io";

    const env = getDeepBookEnv();
    assert.equal(env.env, "mainnet");
    assert.equal(env.defaultPool, "SUI_USDC");
    assert.equal(env.defaultManagerKey, DEFAULT_BALANCE_MANAGER_KEY);
    assert.ok(env.coins.SUI);
    assert.ok(env.pools.SUI_USDC);
    assert.equal(env.indexerUrl, "https://deepbook-indexer.mainnet.mystenlabs.com");
  });

  it("uses testnet defaults when DEEPBOOK_ENV=testnet", () => {
    process.env.DEEPBOOK_ENV = "testnet";

    const env = getDeepBookEnv();
    assert.equal(env.env, "testnet");
    assert.equal(env.defaultPool, "SUI_DBUSDC");
    assert.ok(env.pools.SUI_DBUSDC);
    assert.equal(env.indexerUrl, "https://deepbook-indexer.testnet.mystenlabs.com");
  });

  it("honors DEEPBOOK_DEFAULT_POOL override", () => {
    process.env.DEEPBOOK_ENV = "mainnet";
    process.env.DEEPBOOK_DEFAULT_POOL = "DEEP_SUI";

    const env = getDeepBookEnv();
    assert.equal(env.defaultPool, "DEEP_SUI");
  });

  it("honors DEEPBOOK_INDEXER_URL override", () => {
    process.env.DEEPBOOK_INDEXER_URL = "https://custom-indexer.example.com/";

    const env = getDeepBookEnv();
    assert.equal(env.indexerUrl, "https://custom-indexer.example.com");
  });
});
