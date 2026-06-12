import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getAgentProvider } from "../../../src/config/agent.js";
import { getAgentRuntime } from "../../../src/services/agent/runtime/index.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("getAgentProvider", () => {
  it("returns stub when no OpenAI key is configured", () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.AGENT_PROVIDER;
    assert.equal(getAgentProvider(), "stub");
  });

  it("returns openai when key is present and provider is openai", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.AGENT_PROVIDER = "openai";
    assert.equal(getAgentProvider(), "openai");
  });

  it("forces stub when AGENT_PROVIDER=stub", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.AGENT_PROVIDER = "stub";
    assert.equal(getAgentProvider(), "stub");
  });
});

describe("getAgentRuntime", () => {
  it("selects stub runtime when provider is stub", () => {
    delete process.env.OPENAI_API_KEY;
    process.env.AGENT_PROVIDER = "stub";
    assert.equal(getAgentRuntime().id, "stub");
  });

  it("selects openai runtime when provider is openai", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.AGENT_PROVIDER = "openai";
    assert.equal(getAgentRuntime().id, "openai");
  });
});
