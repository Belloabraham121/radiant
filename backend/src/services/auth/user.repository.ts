import type { AgentWallet, Prisma, User } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";

export type UserWithWallet = User & { agent_wallet: AgentWallet | null };

export async function findUserByPrivyId(privyUserId: string): Promise<UserWithWallet | null> {
  return prisma.user.findUnique({
    where: { privy_user_id: privyUserId },
    include: { agent_wallet: true },
  });
}

export async function findUserByEmail(email: string): Promise<UserWithWallet | null> {
  return prisma.user.findUnique({
    where: { email },
    include: { agent_wallet: true },
  });
}

export async function createUser(data: Prisma.UserCreateInput): Promise<UserWithWallet> {
  return prisma.user.create({
    data,
    include: { agent_wallet: true },
  });
}

export async function updateUserEmail(
  privyUserId: string,
  email: string,
): Promise<UserWithWallet> {
  return prisma.user.update({
    where: { privy_user_id: privyUserId },
    data: { email },
    include: { agent_wallet: true },
  });
}
