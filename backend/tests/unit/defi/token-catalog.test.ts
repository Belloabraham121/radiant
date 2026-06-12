import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetDeepBookEnvForTests } from "../../../src/config/deepbook.js";
import type { IndexerAssetsResponse } from "../../../src/services/defi/deepbook-indexer.client.js";
import {
  getCatalogForWallet,
  getTokenCatalog,
  resetTokenCatalogForTests,
  setFetchIndexerAssetsForTests,
} from "../../../src/services/defi/token-catalog.service.js";

const MOCK_ASSETS: IndexerAssetsResponse = {
  SUI: {
    name: "Sui",
    asset_type: "0x2::sui::SUI",
    contractAddress: "0x2",
  },
  USDC: {
    name: "USDC",
    asset_type: "0xusdc::usdc::USDC",
    contractAddress: "0xusdc",
  },
  DEEP: {
    name: "Deepbook Protocol",
    asset_type: "0xdeep::deep::DEEP",
    contractAddress: "0xdeep",
  },
};

describe("token-catalog.service", () => {
  afterEach(() => {
    resetTokenCatalogForTests();
    resetDeepBookEnvForTests();
  });

  it("loads popular tokens from indexer", async () => {
    setFetchIndexerAssetsForTests(async () => MOCK_ASSETS);

    const { entries, source } = await getTokenCatalog();
    assert.equal(source, "indexer");
    assert.ok(entries.some((e) => e.symbol === "SUI" && e.popular));
    assert.ok(entries.some((e) => e.symbol === "USDC" && e.popular));
  });

  it("getCatalogForWallet returns only popular entries", async () => {
    setFetchIndexerAssetsForTests(async () => MOCK_ASSETS);

    const popular = await getCatalogForWallet();
    assert.ok(popular.every((entry) => entry.popular));
    assert.ok(popular.some((entry) => entry.symbol === "SUI"));
  });

  it("falls back when indexer is unavailable", async () => {
    setFetchIndexerAssetsForTests(async () => {
      throw new Error("indexer down");
    });

    const { source, entries } = await getTokenCatalog();
    assert.equal(source, "fallback");
    assert.ok(entries.some((e) => e.symbol === "USDC"));
  });
});
