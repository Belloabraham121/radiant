import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AppError } from "../../../../src/errors/app-error.js";
import {
  buildSquidSdkConfig,
  squidSdk,
  resetSquidClientForTests,
} from "../../../../src/services/defi/squid/squid.client.js";

describe("squid.client", () => {
  let originalFetch: typeof globalThis.fetch;

  afterEach(() => {
    delete process.env.SQUID_INTEGRATOR_ID;
    delete process.env.SQUID_API_BASE_URL;
    delete process.env.SQUID_ENABLED;
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
    resetSquidClientForTests();
  });

  it("buildSquidSdkConfig uses v2 API base and integrator id", () => {
    process.env.SQUID_INTEGRATOR_ID = "radiant-test";
    const options = buildSquidSdkConfig();
    assert.equal(options.integratorId, "radiant-test");
    assert.equal(options.baseUrl, "https://v2.api.squidrouter.com");
    assert.equal(options.timeout, 30_000);
  });

  it("buildSquidSdkConfig respects SQUID_API_BASE_URL override", () => {
    process.env.SQUID_INTEGRATOR_ID = "radiant-test";
    process.env.SQUID_API_BASE_URL = "https://custom.squid.example/";
    const options = buildSquidSdkConfig();
    assert.equal(options.baseUrl, "https://custom.squid.example");
  });

  it("preserves HTTP status when deposit-address error body is non-JSON", async () => {
    process.env.SQUID_INTEGRATOR_ID = "radiant-test";
    process.env.SQUID_ENABLED = "true";
    originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: false,
        status: 429,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON");
        },
      }) as Response;

    await assert.rejects(
      squidSdk.requestDepositAddress({
        route: {
          transactionRequest: { type: "CHAINFLIP_DEPOSIT_ADDRESS", request: {} },
        },
      } as never),
      (err: unknown) => err instanceof AppError && err.code === "SQUID_RATE_LIMITED",
    );
  });
});
