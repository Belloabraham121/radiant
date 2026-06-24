import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildUpstreamProxyHeaders } from "../../src/lib/api";

describe("buildUpstreamProxyHeaders", () => {
  it("forwards cookie, origin, referer, and CSRF headers from the browser request", () => {
    const request = new Request("http://localhost:3000/api/v1/chat?stream=1", {
      method: "POST",
      headers: {
        cookie: "privy-token=abc; radiant-csrf=csrf123",
        origin: "http://localhost:3000",
        referer: "http://localhost:3000/app/chat/s1",
        "x-csrf-token": "csrf123",
        "x-radiant-client": "fetch",
      },
    });

    assert.deepEqual(buildUpstreamProxyHeaders(request), {
      cookie: "privy-token=abc; radiant-csrf=csrf123",
      origin: "http://localhost:3000",
      referer: "http://localhost:3000/app/chat/s1",
      "x-csrf-token": "csrf123",
      "x-radiant-client": "fetch",
    });
  });

  it("omits missing optional headers", () => {
    const request = new Request("http://localhost:3000/api/v1/chat", {
      method: "POST",
      headers: {
        cookie: "privy-token=abc",
      },
    });

    assert.deepEqual(buildUpstreamProxyHeaders(request), {
      cookie: "privy-token=abc",
    });
  });
});
