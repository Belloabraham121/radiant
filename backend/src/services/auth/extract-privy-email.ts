import type { LinkedAccount, User } from "@privy-io/node/resources/users.mjs";
import { normalizeEmail } from "../../utils/normalize-email.js";
import type { LinkedAccountLabel } from "./auth.types.js";

function emailFromLinkedAccount(account: LinkedAccount): string | null {
  switch (account.type) {
    case "email":
      return account.address;
    case "google_oauth":
      return account.email;
    case "github_oauth":
    case "discord_oauth":
    case "linkedin_oauth":
    case "apple_oauth":
      return account.email ?? null;
    default:
      return null;
  }
}

function linkedAccountLabel(account: LinkedAccount): LinkedAccountLabel | null {
  switch (account.type) {
    case "google_oauth":
      return "google";
    case "github_oauth":
      return "github";
    case "email":
      return "email";
    default:
      return null;
  }
}

export function extractEmailFromPrivyUser(user: User): string | null {
  for (const account of user.linked_accounts) {
    const email = emailFromLinkedAccount(account);
    if (email) {
      return normalizeEmail(email);
    }
  }
  return null;
}

export function extractLinkedAccountLabels(user: User): LinkedAccountLabel[] {
  const labels = new Set<LinkedAccountLabel>();
  for (const account of user.linked_accounts) {
    const label = linkedAccountLabel(account);
    if (label) {
      labels.add(label);
    }
  }
  return [...labels];
}
