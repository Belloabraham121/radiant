import type { User } from "@privy-io/node/resources/users.mjs";
import { AppError } from "../../errors/app-error.js";
import { normalizeEmail } from "../../utils/normalize-email.js";
import type { AuthMeData } from "./auth.types.js";
import { extractEmailFromPrivyUser, extractLinkedAccountLabels } from "./extract-privy-email.js";
import {
  createUser,
  findUserByEmail,
  findUserByPrivyId,
  updateUserEmail,
  type UserWithWallet,
} from "./user.repository.js";

function assertNoEmailConflict(
  email: string,
  privyUserId: string,
  existing: UserWithWallet | null,
): void {
  if (existing && existing.privy_user_id !== privyUserId) {
    throw new AppError(
      409,
      "ACCOUNT_MERGE_REQUIRED",
      "This email is linked to another account. Complete login method transfer in Privy.",
      { email },
    );
  }
}

export async function getOrCreateUser(
  privyUserId: string,
  privyUser: User,
): Promise<UserWithWallet> {
  const email = extractEmailFromPrivyUser(privyUser);
  const existing = await findUserByPrivyId(privyUserId);

  if (existing) {
    if (!email) {
      return existing;
    }

    const normalized = normalizeEmail(email);
    const emailOwner = await findUserByEmail(normalized);
    assertNoEmailConflict(normalized, privyUserId, emailOwner);

    if (existing.email !== normalized) {
      return updateUserEmail(privyUserId, normalized);
    }

    return existing;
  }

  if (email) {
    const normalized = normalizeEmail(email);
    const emailOwner = await findUserByEmail(normalized);
    assertNoEmailConflict(normalized, privyUserId, emailOwner);

    return createUser({
      privy_user_id: privyUserId,
      email: normalized,
    });
  }

  return createUser({
    privy_user_id: privyUserId,
  });
}

export function toAuthMeData(
  user: UserWithWallet,
  privyUser: User,
  funded = false,
): AuthMeData {
  return {
    privy_user_id: user.privy_user_id,
    email: user.email,
    linked_accounts: extractLinkedAccountLabels(privyUser),
    agent_wallet: user.agent_wallet
      ? {
          sui_address: user.agent_wallet.sui_address,
          funded,
        }
      : null,
  };
}
