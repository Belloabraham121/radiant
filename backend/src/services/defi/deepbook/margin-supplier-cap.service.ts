import { getMarginSupplierCapType } from "../../../config/deepbook.js";
import { AppError } from "../../../errors/app-error.js";
import { getSuiClient } from "../../../infrastructure/sui/client.js";
import { findUserByPrivyId } from "../../auth/user.repository.js";
import { findCreatedObjectIdAfterTransaction } from "../../wallet/sui-transaction.service.js";
import {
  createMarginSupplierCap,
  findMarginSupplierCapByUserId,
  upsertMarginSupplierCap,
} from "./margin-supplier-cap.repository.js";

const SUPPLIER_CAP_TYPE_FRAGMENT = "margin_pool::SupplierCap";

export async function findSupplierCapOnChain(walletAddress: string): Promise<string | null> {
  const client = getSuiClient();
  const structType = getMarginSupplierCapType();

  let cursor: string | undefined;
  for (;;) {
    const page = await client.listOwnedObjects({
      owner: walletAddress,
      type: structType,
      limit: 5,
      cursor,
    });

    for (const object of page.objects) {
      if (object.objectId.startsWith("0x")) {
        return object.objectId;
      }
    }

    if (!page.hasNextPage || !page.cursor) {
      break;
    }
    cursor = page.cursor;
  }

  return null;
}

export async function resolveSupplierCapObjectId(
  privyUserId: string,
  walletAddress: string,
): Promise<string | null> {
  const user = await findUserByPrivyId(privyUserId);
  if (user) {
    const row = await findMarginSupplierCapByUserId(user.id);
    if (row?.supplier_cap_object_id) {
      return row.supplier_cap_object_id;
    }
  }

  const onChain = await findSupplierCapOnChain(walletAddress);
  if (onChain && user) {
    await upsertMarginSupplierCap(user.id, onChain).catch(() => {
      // Best-effort cache; on-chain id is still valid for this tx.
    });
  }

  return onChain;
}

export async function requireSupplierCapForWithdraw(
  privyUserId: string,
  walletAddress: string,
): Promise<string> {
  const capId = await resolveSupplierCapObjectId(privyUserId, walletAddress);
  if (!capId) {
    throw new AppError(
      404,
      "NO_SUPPLIER_CAP",
      "No margin pool SupplierCap found. Supply liquidity first — your first supply mints the cap automatically.",
    );
  }
  return capId;
}

export async function persistSupplierCapAfterMint(
  privyUserId: string,
  digest: string,
): Promise<string> {
  const objectId = await findCreatedObjectIdAfterTransaction(digest, SUPPLIER_CAP_TYPE_FRAGMENT);
  if (!objectId) {
    throw new AppError(
      502,
      "SUPPLIER_CAP_CREATE_FAILED",
      "SupplierCap mint succeeded but the new object id could not be resolved.",
      { digest },
    );
  }

  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    return objectId;
  }

  try {
    await upsertMarginSupplierCap(user.id, objectId);
  } catch {
    const existing = await findMarginSupplierCapByUserId(user.id);
    if (existing) {
      return existing.supplier_cap_object_id;
    }
    await createMarginSupplierCap({
      user: { connect: { id: user.id } },
      chain_id: "sui",
      supplier_cap_object_id: objectId,
    });
  }

  return objectId;
}
