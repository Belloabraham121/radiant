import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { clearMemoryCacheForTests } from "../../../src/infrastructure/redis/cache.js";
import { clearTokenBucketsForTests } from "../../../src/infrastructure/rate-limit/token-bucket.js";
import {
  isAmountUnitAmbiguous,
  parseAmountFromToken,
  parseUserAmount,
  resolveUserAmountToToken,
} from "../../../src/services/market/resolve-user-amount.js";
import {
  resetCoingeckoClientForTests,
  setCoingeckoFetchForTests,
} from "../../../src/services/market/coingecko.client.js";
import { AppError } from "../../../src/errors/app-error.js";

describe("resolve-user-amount parser", () => {
  it("parses USD with dollar sign", () => {
    assert.deepEqual(parseUserAmount("$0.6"), { value: 0.6, unit: "usd" });
    assert.deepEqual(parseUserAmount("$10"), { value: 10, unit: "usd" });
  });

  it("parses USD word forms", () => {
    assert.deepEqual(parseUserAmount("10 usd"), { value: 10, unit: "usd" });
    assert.deepEqual(parseUserAmount("0.6 dollars"), { value: 0.6, unit: "usd" });
  });

  it("parses cents", () => {
    assert.deepEqual(parseUserAmount("60 cents"), { value: 0.6, unit: "usd" });
    assert.deepEqual(parseUserAmount("1 cent"), { value: 0.01, unit: "usd" });
  });

  it("parses token amounts", () => {
    assert.deepEqual(parseUserAmount("0.5"), { value: 0.5, unit: "token" });
    assert.deepEqual(parseUserAmount("0.5 eth"), { value: 0.5, unit: "token" });
  });

  it("parses amount tokens", () => {
    assert.deepEqual(parseAmountFromToken("$10"), { value: 10, unit: "usd" });
    assert.deepEqual(parseAmountFromToken("10usd"), { value: 10, unit: "usd" });
    assert.deepEqual(parseAmountFromToken("2"), { value: 2, unit: "token" });
  });

  it("detects ambiguous expensive-token amounts", () => {
    assert.equal(isAmountUnitAmbiguous(0.6, "token", "ETH"), true);
    assert.equal(isAmountUnitAmbiguous(1.5, "token", "ETH"), true);
    assert.equal(isAmountUnitAmbiguous(0.6, "usd", "ETH"), false);
    assert.equal(isAmountUnitAmbiguous(2, "token", "ETH"), false);
    assert.equal(isAmountUnitAmbiguous(0.6, "token", "SUI"), false);
  });
});

describe("resolveUserAmountToToken", () => {
  afterEach(() => {
    clearMemoryCacheForTests();
    clearTokenBucketsForTests();
    resetCoingeckoClientForTests();
  });

  it("returns token amounts unchanged", async () => {
    const result = await resolveUserAmountToToken({
      value: 1.5,
      unit: "token",
      symbol: "SUI",
    });
    assert.equal(result.amountDisplay, 1.5);
    assert.equal(result.symbol, "SUI");
    assert.equal(result.resolvedFromUsd, undefined);
  });

  it("converts USD to token using mocked price", async () => {
    setCoingeckoFetchForTests(async (input) => {
      const url = String(input);
      assert.ok(url.includes("/coins/markets"));
      return new Response(
        JSON.stringify([
          {
            id: "ethereum",
            symbol: "eth",
            name: "Ethereum",
            current_price: 2000,
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await resolveUserAmountToToken({
      value: 10,
      unit: "usd",
      symbol: "ETH",
      amountSide: "pay",
    });

    assert.equal(result.symbol, "ETH");
    assert.equal(result.resolvedFromUsd, 10);
    assert.equal(result.amountDisplay, 0.005);
  });

  it("throws when price unavailable", async () => {
    setCoingeckoFetchForTests(async () => new Response("[]", { status: 200 }));

    await assert.rejects(
      () =>
        resolveUserAmountToToken({
          value: 5,
          unit: "usd",
          symbol: "ETH",
        }),
      (err: unknown) => err instanceof AppError && err.code === "PRICE_UNAVAILABLE",
    );
  });
});
