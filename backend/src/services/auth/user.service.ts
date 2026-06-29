import type { User } from "@privy-io/node";
import type { Prisma } from "@prisma/client";
import { getDefaultAgentChainId } from "../../config/chains.js";
import { getFeatureFlags } from "../../config/features.js";
import { AppError } from "../../errors/app-error.js";
import { normalizeEmail } from "../../utils/normalize-email.js";
import type { ChainId } from "../chains/types.js";
import type { AuthMeAgentWallet, AuthMeData } from "./auth.types.js";
import { extractEmailFromPrivyUser, extractLinkedAccountLabels } from "./extract-privy-email.js";
import { extractDisplayNameFromPrivyUser } from "./extract-privy-profile.js";
import { agentPermissionsFromUser } from "../agent/agent-permissions.service.js";
import { DEFAULT_AVATAR_STYLE } from "./profile.constants.js";
import {
  createUser,
  defaultUserProfileFields,
  findUserByEmail,
  findUserByPrivyId,
  mergeOrphanUserIntoSurvivor,
  newAvatarSeed,
  updateUserEmail,
  type UserWithWallets,
} from "./user.repository.js";
import { prisma } from "../../infrastructure/postgres/client.js";

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

function profileCreateInput(privyUser: User): Pick<
  Prisma.UserCreateInput,
  "avatar_seed" | "avatar_style" | "display_name"
> {
  return {
    ...defaultUserProfileFields(),
    display_name: extractDisplayNameFromPrivyUser(privyUser),
  };
}

async function syncProfileFromPrivy(
  privyUserId: string,
  privyUser: User,
  existing: UserWithWallets,
): Promise<UserWithWallets> {
  const displayName = extractDisplayNameFromPrivyUser(privyUser);
  const data: Prisma.UserUpdateInput = {};

  if (!existing.avatar_seed) {
    data.avatar_seed = newAvatarSeed();
  }
  if (!existing.avatar_style) {
    data.avatar_style = DEFAULT_AVATAR_STYLE;
  }
  if (displayName && existing.display_name !== displayName) {
    data.display_name = displayName;
  }

  if (Object.keys(data).length === 0) {
    return existing;
  }

  return prisma.user.update({
    where: { privy_user_id: privyUserId },
    data,
    include: { agent_wallets: true },
  });
}

export async function getOrCreateUser(
  privyUserId: string,
  privyUser: User,
): Promise<UserWithWallets> {
  const email = extractEmailFromPrivyUser(privyUser);
  const existing = await findUserByPrivyId(privyUserId);

  if (existing) {
    let user = existing;

    if (email) {
      const normalized = normalizeEmail(email);
      const emailOwner = await findUserByEmail(normalized);
      assertNoEmailConflict(normalized, privyUserId, emailOwner);

      if (user.email !== normalized) {
        user = await updateUserEmail(privyUserId, normalized);
      }
    }

    return syncProfileFromPrivy(privyUserId, privyUser, user);
  }

  if (email) {
    const normalized = normalizeEmail(email);
    const emailOwner = await findUserByEmail(normalized);
    assertNoEmailConflict(normalized, privyUserId, emailOwner);

    const user = await createUser({
      privy_user_id: privyUserId,
      email: normalized,
      ...profileCreateInput(privyUser),
    });
    return user;
  }

  return createUser({
    privy_user_id: privyUserId,
    ...profileCreateInput(privyUser),
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

/** Refresh email + display name after Privy linked/unlinked/updated account webhooks. */
export async function syncUserFromPrivyUser(privyUser: User): Promise<void> {
  const existing = await findUserByPrivyId(privyUser.id);
  if (!existing) {
    return;
  }

  await syncProfileFromPrivy(privyUser.id, privyUser, existing);

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

/** @deprecated Use `syncUserFromPrivyUser`. */
export const syncUserEmailFromPrivyUser = syncUserFromPrivyUser;

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
  await syncUserFromPrivyUser(input.survivorPrivyUser);
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
    display_name: user.display_name,
    avatar_seed: user.avatar_seed,
    avatar_style: user.avatar_style,
    member_since: user.created_at.toISOString(),
    linked_accounts: extractLinkedAccountLabels(privyUser),
    agent_wallet: primaryWallet,
    agent_wallets,
    agent_permissions: agentPermissionsFromUser(user),
    features: getFeatureFlags(),
  };
}
