import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { callApi } from "../../../src/services/agent/browsing/call-api.service.js";

describe("call-api SSRF hardening", () => {
  it("blocks redirect hops to private hosts", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = mock.fn(async (url: string | URL) => {
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
        () => callApi({ url: "https://public.example/start" }),
        (err: Error & { code?: string }) => {
          assert.equal(err.code, "BLOCKED_URL");
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("blocks initial private IP URLs", async () => {
    await assert.rejects(
      () => callApi({ url: "http://10.0.0.1/data" }),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, "BLOCKED_URL");
        return true;
      },
    );
  });
});
