import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { resetDeepBookEnvForTests } from "../../../src/config/deepbook.js";
import {
  getDeepBookClient,
  getSuiDeepBookClient,
  resetSuiDeepBookClientsForTests,
  setSuiClientFactoryForTests,
} from "../../../src/services/defi/deepbook/providers/sui-deepbook.provider.js";
import { getDefaultSwapProvider, getSwapProvider } from "../../../src/services/defi/deepbook/swap-registry.js";

const TEST_ADDRESS = `0x${"a".repeat(64)}`;

function createTestSuiClient(): SuiGrpcClient {
  return new SuiGrpcClient({
    network: "mainnet",
    baseUrl: "https://fullnode.mainnet.sui.io:443",
  });
}

describe("sui-deepbook.provider", () => {
  afterEach(() => {
    resetSuiDeepBookClientsForTests();
    resetDeepBookEnvForTests();
  });

  it("extends Sui client with deepbook API", () => {
    setSuiClientFactoryForTests(createTestSuiClient);

    const client = getSuiDeepBookClient({ address: TEST_ADDRESS });
    assert.ok(client.deepbook);
    assert.equal(typeof client.deepbook.midPrice, "function");
    assert.equal(typeof client.deepbook.balanceManager.createAndShareBalanceManager, "function");
  });

  it("returns the same cached client for identical context", () => {
    setSuiClientFactoryForTests(createTestSuiClient);

    const ctx = {
      address: TEST_ADDRESS,
      balanceManagers: {
        RADIANT_BM_1: { address: `0x${"b".repeat(64)}` },
      },
    };

    const first = getSuiDeepBookClient(ctx);
    const second = getSuiDeepBookClient(ctx);
    assert.equal(first, second);
  });

  it("creates a new client when balance manager config changes", () => {
    setSuiClientFactoryForTests(createTestSuiClient);

    const base = {
      address: TEST_ADDRESS,
      balanceManagers: {
        RADIANT_BM_1: { address: `0x${"b".repeat(64)}` },
      },
    };

    const first = getSuiDeepBookClient(base);
    const second = getSuiDeepBookClient({
      ...base,
      balanceManagers: {
        RADIANT_BM_1: { address: `0x${"c".repeat(64)}` },
      },
    });

    assert.notEqual(first, second);
  });

  it("getDeepBookClient returns the deepbook extension", () => {
    setSuiClientFactoryForTests(createTestSuiClient);

    const deepbook = getDeepBookClient({ address: TEST_ADDRESS });
    assert.equal(typeof deepbook.poolId, "function");
  });
});

describe("swap-registry", () => {
  it("registers sui-deepbook as default Sui provider", () => {
    const provider = getSwapProvider("sui-deepbook");
    assert.equal(provider.chain_id, "sui");
    assert.equal(provider.label, "DeepBook V3");

    const defaultProvider = getDefaultSwapProvider("sui");
    assert.ok(defaultProvider);
    assert.equal(defaultProvider?.id, "sui-deepbook");
  });
});
