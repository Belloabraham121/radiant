import { cacheGet, cacheSet } from "../../../infrastructure/redis/cache.js";
import type {
  CrossChainFallbackStatus,
  StoredLiquidityFallbackOffer,
} from "./cross-chain.types.js";

export const FALLBACK_OFFER_TTL_SECONDS = 600;

export function fallbackOfferCacheKey(fallbackOfferId: string): string {
  return `defi:cross-chain:fallback:${fallbackOfferId}`;
}

export async function storeLiquidityFallbackOffer(
  offer: StoredLiquidityFallbackOffer,
): Promise<void> {
  await cacheSet(fallbackOfferCacheKey(offer.fallback_offer_id), offer, FALLBACK_OFFER_TTL_SECONDS);
}

async function readStoredOffer(
  fallbackOfferId: string,
): Promise<StoredLiquidityFallbackOffer | null> {
  return cacheGet<StoredLiquidityFallbackOffer>(fallbackOfferCacheKey(fallbackOfferId));
}

async function updateFallbackOfferStatus(
  fallbackOfferId: string,
  status: CrossChainFallbackStatus,
): Promise<void> {
  const stored = await readStoredOffer(fallbackOfferId);
  if (!stored) {
    return;
  }
  await storeLiquidityFallbackOffer({ ...stored, status });
}

export async function getLiquidityFallbackOffer(
  fallbackOfferId: string,
): Promise<StoredLiquidityFallbackOffer | null> {
  const stored = await readStoredOffer(fallbackOfferId);
  if (!stored) {
    return null;
  }

  if (stored.status === "offered" && new Date(stored.expires_at).getTime() <= Date.now()) {
    await markFallbackOfferExpired(fallbackOfferId);
    return { ...stored, status: "expired" };
  }

  return stored;
}

export async function markFallbackOfferAccepted(fallbackOfferId: string): Promise<void> {
  await updateFallbackOfferStatus(fallbackOfferId, "accepted");
}

export async function markFallbackOfferRejected(fallbackOfferId: string): Promise<void> {
  await updateFallbackOfferStatus(fallbackOfferId, "rejected");
}

export async function markFallbackOfferExpired(fallbackOfferId: string): Promise<void> {
  await updateFallbackOfferStatus(fallbackOfferId, "expired");
}
