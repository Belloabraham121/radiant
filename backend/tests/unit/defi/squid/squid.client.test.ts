import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  buildSquidSdkConfig,
} from "../../../../src/services/defi/squid/squid.client.config.js";

describe("squid.client", () => {
  afterEach(() => {
    delete process.env.SQUID_INTEGRATOR_ID;
    delete process.env.SQUID_API_BASE_URL;
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
});
