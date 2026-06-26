import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeToolErrorMessage } from "../../src/lib/sanitize-tool-error";

describe("sanitizeToolErrorMessage — squid", () => {
  it("returns friendly copy for SQUID_NO_ROUTE", () => {
    const message = sanitizeToolErrorMessage("SQUID_NO_ROUTE: No alternate route found");
    assert.match(message, /No alternate route is available/i);
    assert.doesNotMatch(message, /SQUID_NO_ROUTE/);
  });

  it("strips Squid SDK noise from tool errors", () => {
    const message = sanitizeToolErrorMessage(
      "[SquidRouter] integratorId missing @0xsquid/sdk route failed",
    );
    assert.doesNotMatch(message, /@0xsquid\/sdk/);
    assert.doesNotMatch(message, /integratorId/);
  });
});
