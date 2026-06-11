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
