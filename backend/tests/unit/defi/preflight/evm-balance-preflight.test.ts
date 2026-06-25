import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import type { LiFiStep, Route } from "@lifi/types";
import { AppError } from "../../../../src/errors/app-error.js";
import { resetChainConfigCacheForTests } from "../../../../src/config/chains.js";
import { resetEvmConfigCacheForTests } from "../../../../src/config/evm.js";
import {
  resetCoingeckoClientForTests,
  setCoingeckoFetchForTests,
} from "../../../../src/services/market/coingecko.client.js";
import { clearMemoryCacheForTests } from "../../../../src/infrastructure/redis/cache.js";
import { clearTokenBucketsForTests } from "../../../../src/infrastructure/rate-limit/token-bucket.js";
import {
  assertEvmWalletFundedForSpend,
  buildLifiSpendRequirement,
  resetEvmBalancePreflightForTests,
  setEvmBalancePreflightForTests,
} from "../../../../src/services/defi/preflight/evm-balance-preflight.js";

function enableEthereumChains(): void {
  process.env.ENABLED_CHAINS = "ethereum";
  process.env.ENABLED_EVM_CHAIN_IDS = "1,42161,8453";
  process.env.EVM_CHAIN_IDS = "1,42161,8453";
  process.env.EVM_RPC_URL_1 = "http://localhost:8545";
  process.env.EVM_RPC_URL_42161 = "http://localhost:8546";
  process.env.EVM_RPC_URL_8453 = "http://localhost:8547";
  resetChainConfigCacheForTests();
  resetEvmConfigCacheForTests();
}

const mockUsdcStep = {
  id: "step-1",
  type: "lifi",
  tool: "stargate",
  action: {
    fromChainId: 1,
    toChainId: 8453,
    fromToken: {
      chainId: 1,
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      symbol: "USDC",
      decimals: 6,
      name: "USDC",
      priceUSD: "1",
    },
    toToken: {
      chainId: 8453,
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      symbol: "USDC",
      decimals: 6,
      name: "USDC",
      priceUSD: "1",
    },
    fromAmount: "1000000",
    toAmount: "999000",
    slippage: 0.005,
  },
  estimate: {
    fromAmount: "1000000",
    toAmount: "999000",
    executionDuration: 120,
    gasCosts: [{ type: "SEND", price: "20000000000", estimate: "150000", limit: "187500", amount: "3000000000000000", amountUSD: "1.50", token: { symbol: "ETH", decimals: 18, chainId: 1, address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", name: "ETH", priceUSD: "2000" } }],
    feeCosts: [],
  },
} as unknown as LiFiStep;

const mockRoute = {
  id: "route-1",
  fromChainId: 1,
  toChainId: 8453,
  fromAmount: "1000000",
  toAmount: "999000",
  steps: [mockUsdcStep],
} as unknown as Route;

describe("evm-balance-preflight", () => {
  before(() => {
    process.env.COINGECKO_API_KEY = "CG-test-key";
  });

  afterEach(() => {
    resetEvmBalancePreflightForTests();
    clearMemoryCacheForTests();
    clearTokenBucketsForTests();
    resetCoingeckoClientForTests();
  });

  it("buildLifiSpendRequirement maps EVM route to token spend + gas", () => {
    enableEthereumChains();
    const requirement = buildLifiSpendRequirement({
      action: "cross_chain_swap",
      params: {},
      route: mockRoute,
    });

    assert.ok(requirement);
    assert.equal(requirement.evm_chain_id, 1);
    assert.equal(requirement.network_label, "Ethereum");
    assert.equal(requirement.gas_wei, 3_000_000_000_000_000n);
    assert.equal(requirement.spend_token_symbol, "USDC");
    assert.equal(requirement.spend_amount_atomic, 1_000_000n);
    assert.equal(requirement.spend_is_native, false);
  });

  it("buildLifiSpendRequirement returns null for non-EVM source", () => {
    enableEthereumChains();
    const requirement = buildLifiSpendRequirement({
      action: "cross_chain_swap",
      params: {
        from_chain_id: "sui",
        from_amount_atomic: "1000000",
        from_token_symbol: "SUI",
      },
    });

    assert.equal(requirement, null);
  });

  it("buildLifiSpendRequirement for lifi_approve includes gas only", () => {
    enableEthereumChains();
    const requirement = buildLifiSpendRequirement({
      action: "lifi_approve",
      params: {},
      route: mockRoute,
    });

    assert.ok(requirement);
    assert.equal(requirement.evm_chain_id, 1);
    assert.equal(requirement.spend_token_symbol, undefined);
    assert.equal(requirement.gas_wei, 3_000_000_000_000_000n);
  });

  it("assertEvmWalletFundedForSpend throws INSUFFICIENT_BALANCE for empty wallet", async () => {
    enableEthereumChains();
    setCoingeckoFetchForTests(async (input) => {
      const url = String(input);
      if (url.includes("/coins/markets")) {
        return new Response(
          JSON.stringify([
            {
              id: "ethereum",
              symbol: "eth",
              name: "Ethereum",
              image: "https://example.com/eth.png",
              current_price: 3200,
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("[]", { status: 200 });
    });
    setEvmBalancePreflightForTests({
      resolveWallet: async () => ({
        address: "0xabc",
        privy_wallet_id: "wallet-1",
      }),
      fetchNativeBalance: async () => ({ balance_atomic: "0" }),
      fetchTokenAssets: async () => ({
        assets: [
          {
            symbol: "USDC",
            name: "USD Coin",
            coin_type: "privy:ethereum:usdc",
            balance_atomic: "0",
            balance_display: 0,
            decimals: 6,
            usd_value: null,
            source: "privy",
            popular: true,
          },
        ],
      }),
    });

    const requirement = buildLifiSpendRequirement({
      action: "cross_chain_swap",
      params: {},
      route: mockRoute,
    });
    assert.ok(requirement);

    await assert.rejects(
      () => assertEvmWalletFundedForSpend("user-1", requirement),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "INSUFFICIENT_BALANCE");
        assert.match(err.message, /1 USDC \(~\$1\)/);
        assert.match(err.message, /0\.003 ETH \(~\$/);
        assert.match(err.message, /0 USDC/);
        assert.match(err.message, /0 ETH/);
        assert.doesNotMatch(err.message, /e-/i);
        assert.match(err.message, /Ethereum/i);
        assert.match(err.message, /gas/i);
        return true;
      },
    );
  });

  it("assertEvmWalletFundedForSpend omits USD when CoinGecko is unavailable", async () => {
    enableEthereumChains();
    setCoingeckoFetchForTests(async () => new Response("[]", { status: 200 }));
    setEvmBalancePreflightForTests({
      resolveWallet: async () => ({
        address: "0xabc",
        privy_wallet_id: "wallet-1",
      }),
      fetchNativeBalance: async () => ({ balance_atomic: "0" }),
      fetchTokenAssets: async () => ({
        assets: [
          {
            symbol: "USDC",
            name: "USD Coin",
            coin_type: "privy:ethereum:usdc",
            balance_atomic: "0",
            balance_display: 0,
            decimals: 6,
            usd_value: null,
            source: "privy",
            popular: true,
          },
        ],
      }),
    });

    const requirement = buildLifiSpendRequirement({
      action: "cross_chain_swap",
      params: {},
      route: mockRoute,
    });
    assert.ok(requirement);

    await assert.rejects(
      () => assertEvmWalletFundedForSpend("user-1", requirement),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.match(err.message, /1 USDC \(~\$1\)/);
        assert.match(err.message, /0\.003 ETH(?!\ \(~\$)/);
        assert.match(err.message, /0 ETH(?!\ \(~\$)/);
        assert.doesNotMatch(err.message, /e-/i);
        return true;
      },
    );
  });

  it("assertEvmWalletFundedForSpend throws when native gas is insufficient", async () => {
    enableEthereumChains();
    setEvmBalancePreflightForTests({
      resolveWallet: async () => ({
        address: "0xabc",
        privy_wallet_id: "wallet-1",
      }),
      fetchNativeBalance: async () => ({ balance_atomic: "1000" }),
      fetchTokenAssets: async () => ({
        assets: [
          {
            symbol: "USDC",
            name: "USD Coin",
            coin_type: "privy:ethereum:usdc",
            balance_atomic: "5000000",
            balance_display: 5,
            decimals: 6,
            usd_value: null,
            source: "privy",
            popular: true,
          },
        ],
      }),
    });

    const requirement = buildLifiSpendRequirement({
      action: "cross_chain_swap",
      params: {},
      route: mockRoute,
    });
    assert.ok(requirement);

    await assert.rejects(
      () => assertEvmWalletFundedForSpend("user-1", requirement),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "INSUFFICIENT_BALANCE");
        assert.match(err.message, /ETH/i);
        assert.match(err.message, /gas/i);
        return true;
      },
    );
  });

  it("assertEvmWalletFundedForSpend passes when token and gas are sufficient", async () => {
    enableEthereumChains();
    setEvmBalancePreflightForTests({
      resolveWallet: async () => ({
        address: "0xabc",
        privy_wallet_id: "wallet-1",
      }),
      fetchNativeBalance: async () => ({ balance_atomic: "100000000000000000" }),
      fetchTokenAssets: async () => ({
        assets: [
          {
            symbol: "USDC",
            name: "USD Coin",
            coin_type: "privy:ethereum:usdc",
            balance_atomic: "5000000",
            balance_display: 5,
            decimals: 6,
            usd_value: null,
            source: "privy",
            popular: true,
          },
        ],
      }),
    });

    const requirement = buildLifiSpendRequirement({
      action: "cross_chain_swap",
      params: {},
      route: mockRoute,
    });
    assert.ok(requirement);

    await assert.doesNotReject(() => assertEvmWalletFundedForSpend("user-1", requirement));
  });
});
