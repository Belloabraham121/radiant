import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../src/errors/app-error.js";
import {
  formatAgentToolErrorMessage,
  mapAgentToolError,
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

  it("formatAgentToolErrorMessage guides agent on balance errors", () => {
    const message = formatAgentToolErrorMessage(
      new AppError(400, "INSUFFICIENT_BALANCE", "Not enough SUI"),
    );
    assert.match(message, /fund their agent wallet/i);
  });
});
