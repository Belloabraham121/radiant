import { AppError } from "../../../errors/app-error.js";
import { findUserByPrivyId } from "../../auth/user.repository.js";
import { findCreatedObjectIdAfterTransaction } from "../../wallet/sui-transaction.service.js";
import {
  createMarginSupplyReferral,
  findMarginSupplyReferralByUserAndCoinKey,
  upsertMarginSupplyReferral,
} from "./margin-supply-referral.repository.js";

const SUPPLY_REFERRAL_TYPE_FRAGMENT = "SupplyReferral";

export async function resolveSupplyReferralObjectId(
  privyUserId: string,
  coinKey: string,
  explicitReferralId?: string,
): Promise<string | null> {
  if (explicitReferralId?.startsWith("0x")) {
    return explicitReferralId;
  }

  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    return null;
  }

  const row = await findMarginSupplyReferralByUserAndCoinKey(user.id, coinKey);
  return row?.referral_object_id ?? null;
}

export async function requireSupplyReferralForWithdraw(
  privyUserId: string,
  coinKey: string,
  explicitReferralId?: string,
): Promise<string> {
  const referralId = await resolveSupplyReferralObjectId(
    privyUserId,
    coinKey,
    explicitReferralId,
  );
  if (!referralId) {
    throw new AppError(
      404,
      "NO_SUPPLY_REFERRAL",
      "No margin pool supply referral found for this asset. Mint one first with deepbook_margin_mint_supply_referral.",
      { coin_key: coinKey },
    );
  }
  return referralId;
}

export async function persistSupplyReferralAfterMint(
  privyUserId: string,
  coinKey: string,
  digest: string,
): Promise<string> {
  const objectId = await findCreatedObjectIdAfterTransaction(
    digest,
    SUPPLY_REFERRAL_TYPE_FRAGMENT,
  );
  if (!objectId) {
    throw new AppError(
      502,
      "SUPPLY_REFERRAL_CREATE_FAILED",
      "Supply referral mint succeeded but the new object id could not be resolved.",
      { digest, coin_key: coinKey },
    );
  }

  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    return objectId;
  }

  try {
    await upsertMarginSupplyReferral(user.id, coinKey, objectId);
  } catch {
    const existing = await findMarginSupplyReferralByUserAndCoinKey(user.id, coinKey);
    if (existing) {
      return existing.referral_object_id;
    }
    await createMarginSupplyReferral({
      user: { connect: { id: user.id } },
      chain_id: "sui",
      coin_key: coinKey,
      referral_object_id: objectId,
    });
  }

  return objectId;
}
