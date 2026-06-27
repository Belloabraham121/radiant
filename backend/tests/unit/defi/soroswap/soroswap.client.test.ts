import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  resetSoroswapClientForTests,
  setSoroswapFetchImplForTests,
  soroswapRestFetch,
} from "../../../../src/services/defi/soroswap/soroswap.client.js";
import { AppError } from "../../../../src/errors/app-error.js";

describe("soroswap.client", () => {
  afterEach(() => {
    resetSoroswapClientForTests();
    delete process.env.SOROSWAP_API_KEY;
    delete process.env.SOROSWAP_NETWORK;
    delete process.env.SOROSWAP_API_BASE_URL;
  });

  it("soroswapRestFetch attaches Bearer auth, network query param, and parses JSON", async () => {
    process.env.SOROSWAP_API_KEY = "sk_test_secret_key";
    process.env.SOROSWAP_NETWORK = "testnet";

    let capturedUrl = "";
    let capturedHeaders: Headers | undefined;

    setSoroswapFetchImplForTests(async (url, init) => {
      capturedUrl = String(url);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const result = await soroswapRestFetch<{ ok: boolean }>("/health");
    assert.equal(result.ok, true);
    assert.match(capturedUrl, /network=testnet/);
    assert.equal(capturedHeaders?.get("Authorization"), "Bearer sk_test_secret_key");
    assert.equal(capturedHeaders?.get("Accept"), "application/json");
  });

  it("retries on 429 then succeeds", async () => {
    process.env.SOROSWAP_API_KEY = "sk_test_key";
    let attempts = 0;

    setSoroswapFetchImplForTests(async () => {
      attempts += 1;
      if (attempts <= 2) {
        return new Response(JSON.stringify({ message: "rate limited" }), { status: 429 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const result = await soroswapRestFetch<{ ok: boolean }>("/health");
    assert.equal(result.ok, true);
    assert.equal(attempts, 3);
  });

  it("maps exhausted 429 retries to SOROSWAP_RATE_LIMITED without leaking API key", async () => {
    process.env.SOROSWAP_API_KEY = "sk_test_secret_key";

    setSoroswapFetchImplForTests(async () => {
      return new Response(JSON.stringify({ message: "Bearer sk_test_secret_key too many requests" }), {
        status: 429,
      });
    });

    await assert.rejects(
      () => soroswapRestFetch("/health"),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "SOROSWAP_RATE_LIMITED");
        assert.doesNotMatch(String(err.message), /sk_test_secret_key/);
        assert.doesNotMatch(JSON.stringify(err.details ?? {}), /sk_test_secret_key/);
        return true;
      },
    );
  });

  it("maps network failures to SOROSWAP_UNAVAILABLE", async () => {
    process.env.SOROSWAP_API_KEY = "sk_test_key";

    setSoroswapFetchImplForTests(async () => {
      throw new Error("fetch failed: ECONNRESET");
    });

    await assert.rejects(
      () => soroswapRestFetch("/health"),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "SOROSWAP_UNAVAILABLE");
        return true;
      },
    );
  });
});
