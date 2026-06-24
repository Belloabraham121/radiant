import assert from "node:assert/strict";
import dns from "node:dns/promises";
import { describe, it, mock } from "node:test";
import { callApi } from "../../../src/services/agent/browsing/call-api.service.js";

describe("call-api SSRF hardening", () => {
  it("blocks redirect hops to private hosts", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (url: string | URL) => {
      const target = url.toString();
      if (target.startsWith("https://public.example/")) {
        return new Response(null, {
          status: 302,
          headers: { Location: "http://127.0.0.1/secret" },
        });
      }
      return new Response("{}", { status: 200 });
    };

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

  it("strips credential headers before fetch", async () => {
    const originalFetch = globalThis.fetch;
    let seenAuthorization: string | undefined;

    globalThis.fetch = async (_url: string | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      seenAuthorization = headers?.Authorization;
      return new Response("{}", { status: 200 });
    };

    const lookupMock = mock.method(dns, "lookup", async () => [
      { address: "93.184.216.34", family: 4, verbatim: true },
    ]);

    try {
      await callApi({
        url: "https://public.example/check",
        headers: { Authorization: "Bearer secret" },
      });
      assert.equal(seenAuthorization, undefined);
    } finally {
      globalThis.fetch = originalFetch;
      lookupMock.mock.restore();
    }
  });
});
