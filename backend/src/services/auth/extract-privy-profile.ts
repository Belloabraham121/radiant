import type { User } from "@privy-io/node";
import { extractEmailFromPrivyUser } from "./extract-privy-email.js";

/** Best display name from linked Privy accounts (Google → GitHub → email local-part). */
export function extractDisplayNameFromPrivyUser(user: User): string | null {
  for (const account of user.linked_accounts) {
    if (account.type === "google_oauth" && account.name?.trim()) {
      return account.name.trim();
    }
  }

  for (const account of user.linked_accounts) {
    if (account.type === "github_oauth") {
      if (account.name?.trim()) {
        return account.name.trim();
      }
      if (account.username?.trim()) {
        return `@${account.username.trim()}`;
      }
    }
  }

  const email = extractEmailFromPrivyUser(user);
  if (email) {
    const local = email.split("@")[0]?.trim();
    if (local) {
      return local;
    }
  }

  return null;
}
