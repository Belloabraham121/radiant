import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { getSoroswapConfig } from "../../../src/config/soroswap.js";

describe("soroswap config", () => {
  beforeEach(() => {
    delete process.env.SOROSWAP_ENABLED;
    delete process.env.SOROSWAP_API_KEY;
    delete process.env.SOROSWAP_API_BASE_URL;
    delete process.env.SOROSWAP_NETWORK;
    delete process.env.SOROSWAP_DEFAULT_SLIPPAGE;
    delete process.env.SOROSWAP_DEFAULT_TRADE_TYPE;
    delete process.env.SOROSWAP_RATE_LIMIT_CAPACITY;
    delete process.env.SOROSWAP_RATE_LIMIT_REFILL_MS;
  });

  it("returns defaults when env vars are unset", () => {
    const config = getSoroswapConfig();
    assert.equal(config.enabled, false);
    assert.equal(config.apiBaseUrl, "https://api.soroswap.finance");
    assert.equal(config.apiKey, "");
    assert.equal(config.network, "mainnet");
    assert.equal(config.defaultSlippage, 0.01);
    assert.equal(config.defaultTradeType, "EXACT_IN");
    assert.equal(config.rateLimitCapacity, 30);
    assert.equal(config.rateLimitRefillIntervalMs, 2000);
  });

  it("reads enabled flag, slippage, trade type, and rate limits from env", () => {
    process.env.SOROSWAP_ENABLED = "true";
    process.env.SOROSWAP_API_KEY = "sk-test";
    process.env.SOROSWAP_API_BASE_URL = "https://api.soroswap.finance/";
    process.env.SOROSWAP_NETWORK = "testnet";
    process.env.SOROSWAP_DEFAULT_SLIPPAGE = "0.005";
    process.env.SOROSWAP_DEFAULT_TRADE_TYPE = "EXACT_OUT";
    process.env.SOROSWAP_RATE_LIMIT_CAPACITY = "15";
    process.env.SOROSWAP_RATE_LIMIT_REFILL_MS = "1000";

    const config = getSoroswapConfig();
    assert.equal(config.enabled, true);
    assert.equal(config.apiKey, "sk-test");
    assert.equal(config.apiBaseUrl, "https://api.soroswap.finance");
    assert.equal(config.network, "testnet");
    assert.equal(config.defaultSlippage, 0.005);
    assert.equal(config.defaultTradeType, "EXACT_OUT");
    assert.equal(config.rateLimitCapacity, 15);
    assert.equal(config.rateLimitRefillIntervalMs, 1000);
  });

  it("falls back to EXACT_IN for invalid trade type", () => {
    process.env.SOROSWAP_DEFAULT_TRADE_TYPE = "INVALID";
    assert.equal(getSoroswapConfig().defaultTradeType, "EXACT_IN");
  });
});
