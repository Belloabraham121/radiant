import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { User } from "@privy-io/node";
import { extractDisplayNameFromPrivyUser } from "../../../src/services/auth/extract-privy-profile.js";

function privyUser(accounts: User["linked_accounts"]): User {
  return {
    id: "did:privy:test",
    created_at: Date.now(),
    linked_accounts: accounts,
    mfa_methods: [],
    has_accepted_terms: true,
    is_guest: false,
  } as User;
}

describe("extractDisplayNameFromPrivyUser", () => {
  it("prefers Google name", () => {
    const name = extractDisplayNameFromPrivyUser(
      privyUser([
        {
          type: "google_oauth",
          subject: "go-1",
          email: "a@b.com",
          name: "Ada Lovelace",
        } as User["linked_accounts"][number],
        {
          type: "github_oauth",
          subject: "gh-1",
          email: "a@b.com",
          username: "ada",
          name: "Ada",
        } as User["linked_accounts"][number],
      ]),
    );
    assert.equal(name, "Ada Lovelace");
  });

  it("falls back to GitHub username", () => {
    const name = extractDisplayNameFromPrivyUser(
      privyUser([
        {
          type: "github_oauth",
          subject: "gh-1",
          email: "a@b.com",
          username: "radiant-dev",
          name: null,
        } as User["linked_accounts"][number],
      ]),
    );
    assert.equal(name, "@radiant-dev");
  });
});
