import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getHorizonUrl,
  getSorobanRpcUrl,
  getStellarNetwork,
  getStellarPassphrase,
  resetStellarConfigCacheForTests,
} from "../../../src/config/stellar.js";

describe("stellar config", () => {
  afterEach(() => {
    delete process.env.STELLAR_NETWORK;
    delete process.env.HORIZON_URL;
    delete process.env.SOROBAN_RPC_URL;
    delete process.env.STELLAR_PASSPHRASE;
    resetStellarConfigCacheForTests();
  });

  it("defaults to mainnet Horizon and Soroban RPC", () => {
    assert.equal(getStellarNetwork(), "mainnet");
    assert.equal(getHorizonUrl(), "https://horizon.stellar.org");
    assert.equal(getSorobanRpcUrl(), "https://soroban-rpc.mainnet.stellar.org:443");
    assert.match(getStellarPassphrase(), /Public Global Stellar Network/);
  });

  it("honors testnet override", () => {
    process.env.STELLAR_NETWORK = "testnet";
    resetStellarConfigCacheForTests();

    assert.equal(getStellarNetwork(), "testnet");
    assert.equal(getHorizonUrl(), "https://horizon-testnet.stellar.org");
  });
});
