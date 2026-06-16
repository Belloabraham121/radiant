import type { DeepBookMarginSupplierCap, Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/postgres/client.js";

export async function findMarginSupplierCapByPrivyUserId(
  privyUserId: string,
): Promise<DeepBookMarginSupplierCap | null> {
  return prisma.deepBookMarginSupplierCap.findFirst({
    where: { user: { privy_user_id: privyUserId } },
  });
}

export async function findMarginSupplierCapByUserId(
  userId: bigint,
): Promise<DeepBookMarginSupplierCap | null> {
  return prisma.deepBookMarginSupplierCap.findUnique({
    where: { user_id: userId },
  });
}

export async function upsertMarginSupplierCap(
  userId: bigint,
  supplierCapObjectId: string,
): Promise<DeepBookMarginSupplierCap> {
  return prisma.deepBookMarginSupplierCap.upsert({
    where: { user_id: userId },
    create: {
      user: { connect: { id: userId } },
      chain_id: "sui",
      supplier_cap_object_id: supplierCapObjectId,
    },
    update: {
      supplier_cap_object_id: supplierCapObjectId,
      updated_at: new Date(),
    },
  });
}

export async function createMarginSupplierCap(
  data: Prisma.DeepBookMarginSupplierCapCreateInput,
): Promise<DeepBookMarginSupplierCap> {
  return prisma.deepBookMarginSupplierCap.create({ data });
}
