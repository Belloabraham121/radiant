import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { fetchExternal } from "../../../src/services/proxy/external-fetch.service.js";

describe("external-fetch sensitive headers", () => {
  it("does not forward Authorization to non-allowlisted hosts", async () => {
    const originalFetch = globalThis.fetch;
    let forwardedHeaders: HeadersInit | undefined;

    globalThis.fetch = mock.fn(async (_url: string | URL, init?: RequestInit) => {
      forwardedHeaders = init?.headers;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    try {
      await fetchExternal({
        url: "https://public.example/data",
        headers: {
          Authorization: "Bearer stolen",
          Accept: "application/json",
        },
      });
      const headers = forwardedHeaders as Record<string, string>;
      assert.equal(headers.Authorization, undefined);
      assert.equal(headers.Accept, "application/json");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("forwards Authorization when host is allowlisted", async () => {
    process.env.PROXY_SECRET_HEADER_ALLOWLIST_HOSTS = "api.trusted.example";
    const originalFetch = globalThis.fetch;
    let forwardedHeaders: HeadersInit | undefined;

    globalThis.fetch = mock.fn(async (_url: string | URL, init?: RequestInit) => {
      forwardedHeaders = init?.headers;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    try {
      await fetchExternal({
        url: "https://api.trusted.example/data",
        headers: { Authorization: "Bearer allowed" },
      });
      const headers = forwardedHeaders as Record<string, string>;
      assert.equal(headers.Authorization, "Bearer allowed");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.PROXY_SECRET_HEADER_ALLOWLIST_HOSTS;
    }
  });
});
