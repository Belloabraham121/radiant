import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetChainConfigCacheForTests } from "../../../../src/config/chains.js";
import { resetSupportedTokensCacheForTests } from "../../../../src/config/supported-tokens.js";
import { resolveSoroswapAsset } from "../../../../src/services/defi/soroswap/soroswap-asset-resolve.js";
import { setGetSoroswapTokensForTests } from "../../../../src/services/defi/soroswap/soroswap-token-catalog.service.js";
import type { SoroswapToken } from "../../../../src/services/defi/soroswap/soroswap.types.js";

const STELLAR_USDC_ISSUER = "GA5ZSEJY2YZN5OMRE3KK6QANRT6WK463FHAI3BYT5PBSHH5BYKHARY";
const STELLAR_USDC_SOROBAN = "CBBMHZEZ65PQJIHKUQITQYFVOH7PIK6MLG2WBWRD2DWZXJKFSV7TFK";

function enableStellarTokens(): void {
  process.env.ENABLED_CHAINS = "stellar";
  resetChainConfigCacheForTests();
  resetSupportedTokensCacheForTests();
}

const catalogTokens: SoroswapToken[] = [
  {
    address: "native",
    symbol: "XLM",
    decimals: 7,
    name: "Stellar Lumens",
    type: "native",
  },
  {
    address: `USDC:${STELLAR_USDC_ISSUER}`,
    symbol: "USDC",
    decimals: 7,
    name: "USD Coin",
    type: "classic",
    issuer: STELLAR_USDC_ISSUER,
  },
];

describe("soroswap-asset-resolve", () => {
  beforeEach(() => {
    enableStellarTokens();
    setGetSoroswapTokensForTests(async () => catalogTokens);
  });

  afterEach(() => {
    setGetSoroswapTokensForTests(null);
    delete process.env.STELLAR_USDC_SOROBAN_CONTRACT;
    delete process.env.STELLAR_USDC_ISSUER;
    delete process.env.ENABLED_CHAINS;
    resetChainConfigCacheForTests();
    resetSupportedTokensCacheForTests();
  });

  it("resolves XLM to catalog native address", async () => {
    assert.equal(await resolveSoroswapAsset("xlm"), "native");
  });

  it("falls back XLM to native when catalog omits XLM", async () => {
    setGetSoroswapTokensForTests(async () =>
      catalogTokens.filter((token) => token.symbol !== "XLM"),
    );
    assert.equal(await resolveSoroswapAsset("XLM"), "native");
  });

  it("prefers Soroban USDC contract over catalog classic issuer", async () => {
    process.env.STELLAR_USDC_SOROBAN_CONTRACT = STELLAR_USDC_SOROBAN;
    resetSupportedTokensCacheForTests();

    assert.equal(await resolveSoroswapAsset("USDC"), STELLAR_USDC_SOROBAN);
  });

  it("round-trips XLM and USDC symbols through catalog + supported-tokens", async () => {
    process.env.STELLAR_USDC_SOROBAN_CONTRACT = STELLAR_USDC_SOROBAN;
    resetSupportedTokensCacheForTests();

    const xlmAddress = await resolveSoroswapAsset("XLM");
    const usdcAddress = await resolveSoroswapAsset("USDC");

    const xlmCatalog = catalogTokens.find((token) => token.symbol === "XLM");
    const usdcCatalog = catalogTokens.find((token) => token.symbol === "USDC");

    assert.equal(xlmAddress, xlmCatalog?.address);
    assert.notEqual(usdcAddress, usdcCatalog?.address);
    assert.equal(usdcAddress, STELLAR_USDC_SOROBAN);
  });
});
