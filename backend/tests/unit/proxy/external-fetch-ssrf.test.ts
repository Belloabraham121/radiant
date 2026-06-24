import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { fetchExternal } from "../../../src/services/proxy/external-fetch.service.js";

describe("external-fetch SSRF hardening", () => {
  it("blocks redirect hops to private hosts", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCount = 0;

    globalThis.fetch = mock.fn(async (url: string | URL, init?: RequestInit) => {
      fetchCount += 1;
      const target = url.toString();
      if (target.startsWith("https://public.example/")) {
        return new Response(null, {
          status: 302,
          headers: { Location: "http://127.0.0.1/secret" },
        });
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    try {
      await assert.rejects(
        () => fetchExternal({ url: "https://public.example/start" }),
        (err: Error & { code?: string }) => {
          assert.equal(err.code, "PROXY_BLOCKED_HOST");
          return true;
        },
      );
      assert.equal(fetchCount, 1);
      assert.equal((globalThis.fetch as ReturnType<typeof mock.fn>).mock.calls[0]?.[1]?.redirect, "manual");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("blocks IPv6 loopback literals", async () => {
    await assert.rejects(
      () => fetchExternal({ url: "http://[::1]/metadata" }),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, "PROXY_BLOCKED_HOST");
        return true;
      },
    );
  });

  it("blocks IPv6 unique-local addresses", async () => {
    await assert.rejects(
      () => fetchExternal({ url: "http://[fd12:3456:789a:1::1]/internal" }),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, "PROXY_BLOCKED_HOST");
        return true;
      },
    );
  });
});
