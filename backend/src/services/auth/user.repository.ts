import type { AgentWallet, Prisma, User } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";

export type UserWithWallets = User & { agent_wallets: AgentWallet[] };

export async function findUserByPrivyId(privyUserId: string): Promise<UserWithWallets | null> {
  return prisma.user.findUnique({
    where: { privy_user_id: privyUserId },
    include: { agent_wallets: true },
  });
}

export async function findUserByEmail(email: string): Promise<UserWithWallets | null> {
  return prisma.user.findUnique({
    where: { email },
    include: { agent_wallets: true },
  });
}

export async function createUser(data: Prisma.UserCreateInput): Promise<UserWithWallets> {
  return prisma.user.create({
    data,
    include: { agent_wallets: true },
  });
}

export async function updateUserEmail(
  privyUserId: string,
  email: string,
): Promise<UserWithWallets> {
  return prisma.user.update({
    where: { privy_user_id: privyUserId },
    data: { email },
    include: { agent_wallets: true },
  });
}

export async function deleteUserByPrivyId(privyUserId: string): Promise<void> {
  await prisma.user.delete({
    where: { privy_user_id: privyUserId },
  });
}

/** Move orphan chain wallets to survivor, then delete the orphan user row. */
export async function mergeOrphanUserIntoSurvivor(
  fromPrivyUserId: string,
  toPrivyUserId: string,
  survivorEmail: string | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const orphan = await tx.user.findUnique({
      where: { privy_user_id: fromPrivyUserId },
      include: { agent_wallets: true },
    });

    if (!orphan) {
      return;
    }

    let survivor =
      (await tx.user.findUnique({
        where: { privy_user_id: toPrivyUserId },
        include: { agent_wallets: true },
      })) ??
      (await tx.user.create({
        data: {
          privy_user_id: toPrivyUserId,
          email: survivorEmail,
        },
        include: { agent_wallets: true },
      }));

    if (survivorEmail && survivor.email !== survivorEmail) {
      survivor = await tx.user.update({
        where: { privy_user_id: toPrivyUserId },
        data: { email: survivorEmail },
        include: { agent_wallets: true },
      });
    }

    const survivorChains = new Set(survivor.agent_wallets.map((wallet) => wallet.chain_type));

    for (const wallet of orphan.agent_wallets) {
      if (!survivorChains.has(wallet.chain_type)) {
        await tx.agentWallet.update({
          where: { id: wallet.id },
          data: { user_id: survivor.id },
        });
      }
    }

    await tx.user.delete({
      where: { privy_user_id: fromPrivyUserId },
    });
  });
}
