import assert from "node:assert/strict";
import dns from "node:dns/promises";
import { describe, it, mock } from "node:test";
import {
  clearDnsCacheForTests,
  isHostAllowlistedForSecretHeaders,
  isPrivateOrLocalHostname,
  resolveAndValidateHostname,
  sanitizeOutboundRequestHeaders,
  validateOutboundUrl,
} from "../../../src/services/proxy/ssrf-guard.js";

describe("ssrf-guard", () => {
  it("blocks private IPv4 hostnames", () => {
    assert.equal(isPrivateOrLocalHostname("192.168.1.1"), true);
    assert.equal(isPrivateOrLocalHostname("10.0.0.5"), true);
    assert.equal(isPrivateOrLocalHostname("example.com"), false);
  });

  it("blocks .internal hostnames", () => {
    assert.equal(isPrivateOrLocalHostname("service.local.internal"), true);
  });

  it("validateOutboundUrl rejects private hosts", () => {
    assert.throws(
      () => validateOutboundUrl("http://127.0.0.1/secret"),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, "PROXY_BLOCKED_HOST");
        return true;
      },
    );
  });

  it("strips sensitive headers by default", () => {
    const headers = sanitizeOutboundRequestHeaders(
      {
        Authorization: "Bearer secret",
        "X-Api-Key": "key",
        Accept: "application/json",
      },
      "evil.example",
    );
    assert.equal(headers.Authorization, undefined);
    assert.equal(headers["X-Api-Key"], undefined);
    assert.equal(headers.Accept, "application/json");
  });

  it("forwards sensitive headers for allowlisted hosts", () => {
    process.env.PROXY_SECRET_HEADER_ALLOWLIST_HOSTS = "api.trusted.example";
    const headers = sanitizeOutboundRequestHeaders(
      {
        Authorization: "Bearer secret",
        Accept: "application/json",
      },
      "api.trusted.example",
    );
    assert.equal(headers.Authorization, "Bearer secret");
    delete process.env.PROXY_SECRET_HEADER_ALLOWLIST_HOSTS;
  });

  it("matches suffix allowlist patterns", () => {
    process.env.PROXY_SECRET_HEADER_ALLOWLIST_HOSTS = ".stripe.com";
    assert.equal(isHostAllowlistedForSecretHeaders("api.stripe.com"), true);
    assert.equal(isHostAllowlistedForSecretHeaders("evil.example"), false);
    delete process.env.PROXY_SECRET_HEADER_ALLOWLIST_HOSTS;
  });

  it("resolveAndValidateHostname blocks private DNS answers", async () => {
    clearDnsCacheForTests();
    const lookupMock = mock.method(dns, "lookup", async () => [
      { address: "127.0.0.1", family: 4, verbatim: true },
    ]);

    try {
      await assert.rejects(
        () => resolveAndValidateHostname("rebind.example"),
        (err: Error & { code?: string }) => {
          assert.equal(err.code, "PROXY_BLOCKED_HOST");
          return true;
        },
      );
    } finally {
      lookupMock.mock.restore();
      clearDnsCacheForTests();
    }
  });
});
