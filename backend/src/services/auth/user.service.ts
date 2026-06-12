import type { User } from "@privy-io/node";
import { getDefaultAgentChainId } from "../../config/chains.js";
import { AppError } from "../../errors/app-error.js";
import { normalizeEmail } from "../../utils/normalize-email.js";
import type { ChainId } from "../chains/types.js";
import type { AuthMeAgentWallet, AuthMeData } from "./auth.types.js";
import { extractEmailFromPrivyUser, extractLinkedAccountLabels } from "./extract-privy-email.js";
import {
  createUser,
  findUserByEmail,
  findUserByPrivyId,
  mergeOrphanUserIntoSurvivor,
  updateUserEmail,
  type UserWithWallets,
} from "./user.repository.js";

function assertNoEmailConflict(
  email: string,
  privyUserId: string,
  existing: UserWithWallets | null,
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
): Promise<UserWithWallets> {
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

function toAuthMeAgentWallet(
  wallet: {
    chain_type: string;
    address: string;
    signer_added: boolean;
  },
  funded: boolean,
): AuthMeAgentWallet {
  const chainType = wallet.chain_type as ChainId;
  return {
    chain_type: chainType,
    address: wallet.address,
    funded,
    signer_added: wallet.signer_added,
    ...(chainType === "sui" ? { sui_address: wallet.address } : {}),
  };
}

/** Refresh normalized email after Privy linked/unlinked/updated account webhooks. */
export async function syncUserEmailFromPrivyUser(privyUser: User): Promise<void> {
  const existing = await findUserByPrivyId(privyUser.id);
  if (!existing) {
    return;
  }

  const email = extractEmailFromPrivyUser(privyUser);
  if (!email) {
    return;
  }

  const normalized = normalizeEmail(email);
  const emailOwner = await findUserByEmail(normalized);
  if (emailOwner && emailOwner.privy_user_id !== privyUser.id) {
    return;
  }

  if (existing.email !== normalized) {
    await updateUserEmail(privyUser.id, normalized);
  }
}

/** After Privy login-method transfer: keep survivor wallets, delete orphan user row. */
export async function handleTransferredAccount(input: {
  fromPrivyUserId: string;
  survivorPrivyUser: User;
}): Promise<void> {
  const survivorEmail = extractEmailFromPrivyUser(input.survivorPrivyUser);
  await mergeOrphanUserIntoSurvivor(
    input.fromPrivyUserId,
    input.survivorPrivyUser.id,
    survivorEmail,
  );
}

export function toAuthMeData(
  user: UserWithWallets,
  privyUser: User,
  fundedByChain: Map<ChainId, boolean>,
): AuthMeData {
  const agent_wallets = user.agent_wallets.map((wallet) =>
    toAuthMeAgentWallet(
      wallet,
      fundedByChain.get(wallet.chain_type as ChainId) ?? false,
    ),
  );

  const primaryChain = getDefaultAgentChainId();
  const primaryWallet =
    agent_wallets.find((wallet) => wallet.chain_type === primaryChain) ??
    agent_wallets[0] ??
    null;

  return {
    privy_user_id: user.privy_user_id,
    email: user.email,
    linked_accounts: extractLinkedAccountLabels(privyUser),
    agent_wallet: primaryWallet,
    agent_wallets,
  };
}
