import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readAppActionSessionId } from "../../../src/utils/app-action-request-context.js";

describe("readAppActionSessionId", () => {
  it("returns undefined when header is missing", () => {
    assert.equal(readAppActionSessionId({ headers: {} } as never), undefined);
  });

  it("returns uuid when header is valid", () => {
    const sessionId = "00000000-0000-4000-8000-000000000001";
    assert.equal(
      readAppActionSessionId({ headers: { "x-radiant-session-id": sessionId } } as never),
      sessionId,
    );
  });

  it("ignores invalid uuid values", () => {
    assert.equal(
      readAppActionSessionId({ headers: { "x-radiant-session-id": "not-a-uuid" } } as never),
      undefined,
    );
  });
});
