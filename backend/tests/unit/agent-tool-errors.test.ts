import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../src/errors/app-error.js";
import {
  mapAgentToolError,
  toolErrorToModelContent,
} from "../../src/utils/agent-tool-errors.js";

describe("agent-tool-errors", () => {
  it("mapAgentToolError maps insufficient balance to AppError", () => {
    const mapped = mapAgentToolError(new Error("Insufficient balance for SUI coin"));
    assert.equal(mapped.code, "INSUFFICIENT_BALANCE");
    assert.match(mapped.message, /enough/i);
  });

  it("mapAgentToolError passes through AppError", () => {
    const original = new AppError(404, "WALLET_NOT_FOUND", "missing");
    assert.equal(mapAgentToolError(original), original);
  });

  it("toolErrorToModelContent returns structured JSON for the model", () => {
    const content = toolErrorToModelContent({
      code: "INSUFFICIENT_BALANCE",
      message: "Not enough SUI",
    });
    const parsed = JSON.parse(content) as {
      ok: boolean;
      code: string;
      agent_instruction: string;
    };
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, "INSUFFICIENT_BALANCE");
    assert.match(parsed.agent_instruction, /fund/i);
  });
});
