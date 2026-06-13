import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetDeepBookEnvForTests } from "../../../src/config/deepbook.js";
import { AppError } from "../../../src/errors/app-error.js";
import type { IndexerAssetsResponse } from "../../../src/services/defi/deepbook-indexer.client.js";
import {
  resetTokenCatalogForTests,
  setFetchIndexerAssetsForTests,
} from "../../../src/services/defi/token-catalog.service.js";
import { setAdapterForTests } from "../../../src/services/chains/registry.js";
import { suiAdapter } from "../../../src/services/chains/adapters/sui.js";
import { getWalletAssetsForAddress } from "../../../src/services/wallet/wallet-assets.service.js";
import {
  setPrivyBalanceGetForTests,
} from "../../../src/services/wallet/privy-balance.service.js";
import {
  resetSuiBalanceClientForTests,
  setSuiBalanceClientForTests,
} from "../../../src/services/wallet/sui-coin-balances.js";

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
};

describe("getWalletAssetsForPrivyUser", () => {
  afterEach(() => {
    resetTokenCatalogForTests();
    resetDeepBookEnvForTests();
    resetSuiBalanceClientForTests();
    setPrivyBalanceGetForTests(null);
    setAdapterForTests("sui", suiAdapter);
  });

  it("rejects getWalletAssetsForAddress on non-Sui chains", async () => {
    await assert.rejects(
      () =>
        getWalletAssetsForAddress("0x" + "a".repeat(40), {
          chain_id: "ethereum",
        }),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "VALIDATION_ERROR");
        return true;
      },
    );
  });

  it("maps stablecoin USD values and filters zero balances", async () => {
    setFetchIndexerAssetsForTests(async () => MOCK_ASSETS);
    setSuiBalanceClientForTests({
      getBalance: async ({ coinType }) => {
        if (coinType === "0x2::sui::SUI") {
          return { balance: { balance: "0" } };
        }
        return { balance: { balance: "1000000" } };
      },
    });

    const data = await getWalletAssetsForAddress("0x" + "c".repeat(64), {
      chain_id: "sui",
      include_zero: false,
      include_usd: true,
    });

    assert.equal(data.chain_id, "sui");
    assert.equal(data.assets.length, 1);
    assert.equal(data.assets[0]?.symbol, "USDC");
    assert.equal(data.assets[0]?.usd_value, 1);
    assert.equal(data.total_usd, 1);
  });
});
