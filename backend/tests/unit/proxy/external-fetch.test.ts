import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { fetchExternal } from "../../../src/services/proxy/external-fetch.service.js";

describe("external-fetch proxy", () => {
  it("forwards Authorization and X-Api-Key headers to upstream", async () => {
    const originalFetch = globalThis.fetch;
    let capturedHeaders: Headers | undefined;

    globalThis.fetch = mock.fn(async (_url: string | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      await fetchExternal({
        url: "https://api.example.com/v1/data",
        headers: {
          Authorization: "Bearer test-secret-key",
          "X-Api-Key": "another-key",
        },
      });

      assert.ok(capturedHeaders);
      assert.equal(capturedHeaders!.get("Authorization"), "Bearer test-secret-key");
      assert.equal(capturedHeaders!.get("X-Api-Key"), "another-key");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("still strips cookie and host headers", async () => {
    const originalFetch = globalThis.fetch;
    let capturedHeaders: Headers | undefined;

    globalThis.fetch = mock.fn(async (_url: string | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    try {
      await fetchExternal({
        url: "https://api.example.com/v1/data",
        headers: {
          Cookie: "session=abc",
          Host: "evil.example.com",
          Authorization: "Bearer ok",
        },
      });

      assert.equal(capturedHeaders!.get("Cookie"), null);
      assert.equal(capturedHeaders!.get("Host"), null);
      assert.equal(capturedHeaders!.get("Authorization"), "Bearer ok");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
