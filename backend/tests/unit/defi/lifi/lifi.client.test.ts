import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  lifiRestFetch,
  resetLifiClientForTests,
  setLifiFetchImplForTests,
} from "../../../../src/services/defi/lifi/lifi.client.js";

describe("lifi.client", () => {
  afterEach(() => {
    resetLifiClientForTests();
  });

  it("lifiRestFetch attaches API key and parses JSON", async () => {
    process.env.LIFI_API_KEY = "test-key";

    let capturedHeaders: Headers | undefined;
    setLifiFetchImplForTests(async (_url, init) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const result = await lifiRestFetch<{ ok: boolean }>("/chains");
    assert.equal(result.ok, true);
    assert.equal(capturedHeaders?.get("x-lifi-api-key"), "test-key");
  });

  it("retries on 429 then surfaces LIFI_RATE_LIMITED", async () => {
    delete process.env.LIFI_API_KEY;
    let attempts = 0;

    setLifiFetchImplForTests(async () => {
      attempts += 1;
      if (attempts <= 3) {
        return new Response("{}", { status: 429 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const result = await lifiRestFetch<{ ok: boolean }>("/chains");
    assert.equal(result.ok, true);
    assert.equal(attempts, 4);
  });
});
