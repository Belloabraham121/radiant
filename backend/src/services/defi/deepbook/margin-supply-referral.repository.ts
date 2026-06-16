import type { DeepBookMarginSupplyReferral, Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/postgres/client.js";

export async function findMarginSupplyReferralByUserAndCoinKey(
  userId: bigint,
  coinKey: string,
): Promise<DeepBookMarginSupplyReferral | null> {
  return prisma.deepBookMarginSupplyReferral.findUnique({
    where: { user_id_coin_key: { user_id: userId, coin_key: coinKey } },
  });
}

export async function upsertMarginSupplyReferral(
  userId: bigint,
  coinKey: string,
  referralObjectId: string,
): Promise<DeepBookMarginSupplyReferral> {
  return prisma.deepBookMarginSupplyReferral.upsert({
    where: { user_id_coin_key: { user_id: userId, coin_key: coinKey } },
    create: {
      user: { connect: { id: userId } },
      chain_id: "sui",
      coin_key: coinKey,
      referral_object_id: referralObjectId,
    },
    update: {
      referral_object_id: referralObjectId,
      updated_at: new Date(),
    },
  });
}

export async function createMarginSupplyReferral(
  data: Prisma.DeepBookMarginSupplyReferralCreateInput,
): Promise<DeepBookMarginSupplyReferral> {
  return prisma.deepBookMarginSupplyReferral.create({ data });
}
