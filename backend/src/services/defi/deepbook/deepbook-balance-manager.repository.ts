import type { DeepBookBalanceManager, Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/postgres/client.js";

export async function findBalanceManagerByPrivyUserId(
  privyUserId: string,
): Promise<DeepBookBalanceManager | null> {
  return prisma.deepBookBalanceManager.findFirst({
    where: { user: { privy_user_id: privyUserId } },
  });
}

export async function findBalanceManagerByUserId(
  userId: bigint,
): Promise<DeepBookBalanceManager | null> {
  return prisma.deepBookBalanceManager.findUnique({
    where: { user_id: userId },
  });
}

export async function createBalanceManager(
  data: Prisma.DeepBookBalanceManagerCreateInput,
): Promise<DeepBookBalanceManager> {
  return prisma.deepBookBalanceManager.create({ data });
}

export async function updateBalanceManagerTradeCap(
  id: string,
  tradeCapId: string | null,
): Promise<DeepBookBalanceManager> {
  return prisma.deepBookBalanceManager.update({
    where: { id },
    data: { trade_cap_id: tradeCapId },
  });
}
