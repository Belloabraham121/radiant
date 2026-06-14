import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resetSandboxConfigForTests } from "../../../src/config/sandbox.js";
import {
  getSandboxProvider,
  resetSandboxProviderForTests,
} from "../../../src/services/sandbox/sandbox.factory.js";

describe("sandbox factory", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    resetSandboxConfigForTests();
    resetSandboxProviderForTests();
  });

  it("defaults to none provider", () => {
    delete process.env.SANDBOX_PROVIDER;
    resetSandboxConfigForTests();
    resetSandboxProviderForTests();

    assert.equal(getSandboxProvider().name, "none");
  });

  it("selects mock provider from env", () => {
    process.env.SANDBOX_PROVIDER = "mock";
    resetSandboxConfigForTests();
    resetSandboxProviderForTests();

    assert.equal(getSandboxProvider().name, "mock");
  });
});
