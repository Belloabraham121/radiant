import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeEmail } from "../../src/utils/normalize-email.js";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    assert.equal(normalizeEmail("  User@Example.COM  "), "user@example.com");
  });

  it("preserves already normalized email", () => {
    assert.equal(normalizeEmail("dev@radiant.app"), "dev@radiant.app");
  });
});
