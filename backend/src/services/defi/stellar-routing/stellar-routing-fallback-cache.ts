import { cacheGet, cacheSet } from "../../../infrastructure/redis/cache.js";
import type {
  StellarRoutingFallbackStatus,
  StoredStellarRoutingFallbackOffer,
} from "./stellar-routing.types.js";

export const STELLAR_ROUTING_FALLBACK_TTL_SECONDS = 600;

export function stellarRoutingFallbackCacheKey(fallbackOfferId: string): string {
  return `defi:stellar-routing:fallback:${fallbackOfferId}`;
}

export async function storeStellarRoutingFallbackOffer(
  offer: StoredStellarRoutingFallbackOffer,
): Promise<void> {
  await cacheSet(
    stellarRoutingFallbackCacheKey(offer.fallback_offer_id),
    offer,
    STELLAR_ROUTING_FALLBACK_TTL_SECONDS,
  );
}

async function readStoredOffer(
  fallbackOfferId: string,
): Promise<StoredStellarRoutingFallbackOffer | null> {
  return cacheGet<StoredStellarRoutingFallbackOffer>(
    stellarRoutingFallbackCacheKey(fallbackOfferId),
  );
}

async function updateFallbackOfferStatus(
  fallbackOfferId: string,
  status: StellarRoutingFallbackStatus,
): Promise<void> {
  const stored = await readStoredOffer(fallbackOfferId);
  if (!stored) {
    return;
  }
  await storeStellarRoutingFallbackOffer({ ...stored, status });
}

export async function getStellarRoutingFallbackOffer(
  fallbackOfferId: string,
): Promise<StoredStellarRoutingFallbackOffer | null> {
  const stored = await readStoredOffer(fallbackOfferId);
  if (!stored) {
    return null;
  }

  if (stored.status === "offered" && new Date(stored.expires_at).getTime() <= Date.now()) {
    await markStellarRoutingFallbackExpired(fallbackOfferId);
    return { ...stored, status: "expired" };
  }

  return stored;
}

export async function markStellarRoutingFallbackAccepted(fallbackOfferId: string): Promise<void> {
  await updateFallbackOfferStatus(fallbackOfferId, "accepted");
}

export async function markStellarRoutingFallbackRejected(fallbackOfferId: string): Promise<void> {
  await updateFallbackOfferStatus(fallbackOfferId, "rejected");
}

export async function markStellarRoutingFallbackExpired(fallbackOfferId: string): Promise<void> {
  await updateFallbackOfferStatus(fallbackOfferId, "expired");
}
