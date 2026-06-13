import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AppError } from "../../../src/errors/app-error.js";
import {
  getDeepBookOrderbook,
  listDeepBookPools,
  resetDeepBookPoolsServiceForTests,
  setDeepBookIndexerFnsForTests,
} from "../../../src/services/defi/deepbook/deepbook-pools.service.js";
import { IndexerRequestError } from "../../../src/services/defi/deepbook/indexer/deepbook-indexer.client.js";
import type { IndexerPoolRecord } from "../../../src/services/defi/deepbook/indexer/indexer.types.js";

const MOCK_POOLS: IndexerPoolRecord[] = [
  {
    pool_id: "0x1",
    pool_name: "SUI_USDC",
    base_asset_id: "0x2::sui::SUI",
    base_asset_decimals: 9,
    base_asset_symbol: "SUI",
    base_asset_name: "Sui",
    quote_asset_id: "0xusdc",
    quote_asset_decimals: 6,
    quote_asset_symbol: "USDC",
    quote_asset_name: "USDC",
    min_size: 1_000_000_000,
    lot_size: 100_000_000,
    tick_size: 10_000,
  },
];

describe("deepbook-pools.service", () => {
  afterEach(() => {
    resetDeepBookPoolsServiceForTests();
  });

  it("lists pools with ticker data merged", async () => {
    setDeepBookIndexerFnsForTests({
      fetchPools: async () => MOCK_POOLS,
      fetchTicker: async () => ({
        SUI_USDC: {
          last_price: 2.1,
          isFrozen: 0,
          base_volume: 100,
          quote_volume: 210,
        },
      }),
    });

    const result = await listDeepBookPools();
    assert.equal(result.source, "indexer");
    assert.equal(result.pools.length, 1);
    assert.equal(result.pools[0]?.pool_key, "SUI_USDC");
    assert.equal(result.pools[0]?.last_price, 2.1);
    assert.equal(result.pools[0]?.volume_24h, 210);
  });

  it("returns empty pools when indexer responds 404", async () => {
    setDeepBookIndexerFnsForTests({
      fetchPools: async () => {
        throw new IndexerRequestError(404, "/get_pools");
      },
      fetchTicker: async () => ({}),
    });

    const result = await listDeepBookPools();
    assert.deepEqual(result.pools, []);
  });

  it("maps orderbook 404 to POOL_NOT_FOUND", async () => {
    setDeepBookIndexerFnsForTests({
      fetchOrderbook: async () => {
        throw new IndexerRequestError(404, "/orderbook/UNKNOWN");
      },
    });

    await assert.rejects(
      () => getDeepBookOrderbook("UNKNOWN"),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "POOL_NOT_FOUND");
        return true;
      },
    );
  });
});
