import { createHmac } from "node:crypto";
import { getCanvasConfig, isCanvasRuntimeMock } from "../../../../config/canvas.js";
import { optional } from "../../../../config/optional-env.js";
import { AppError } from "../../../../errors/app-error.js";
import { cacheGet, cacheSet } from "../../../../infrastructure/redis/cache.js";
import { getWarmPrivyViemAccount } from "../../signing/warm-privy-lane.js";
import { getPolymarketConfig } from "./polymarket.config.js";

export type PolymarketL2Credentials = {
  apiKey: string;
  secret: string;
  passphrase: string;
  address: string;
};

type CachedCredentials = PolymarketL2Credentials & {
  cached_at: string;
};

function credentialCacheKey(userId: string, address: string): string {
  return `canvas:pm:creds:${userId}:${address.toLowerCase()}`;
}

function readDevStaticCredentials(address: string): PolymarketL2Credentials | null {
  const apiKey = optional("POLYMARKET_BUILDER_API_KEY", "").trim();
  const secret = optional("POLYMARKET_BUILDER_API_SECRET", "").trim();
  const passphrase = optional("POLYMARKET_BUILDER_API_PASSPHRASE", "").trim();
  if (!apiKey || !secret || !passphrase) return null;
  return { apiKey, secret, passphrase, address };
}

export async function derivePolymarketL2Credentials(input: {
  privyUserId: string;
  privyWalletId: string;
  address: string;
}): Promise<PolymarketL2Credentials> {
  const config = getPolymarketConfig();
  if (!config.enabled && !isCanvasRuntimeMock()) {
    throw new AppError(503, "POLYMARKET_DISABLED", "Polymarket integration is disabled.");
  }

  const cacheKey = credentialCacheKey(input.privyUserId, input.address);
  const cached = await cacheGet<CachedCredentials>(cacheKey);
  if (cached) {
    return {
      apiKey: cached.apiKey,
      secret: cached.secret,
      passphrase: cached.passphrase,
      address: cached.address,
    };
  }

  const staticCreds = readDevStaticCredentials(input.address);
  if (staticCreds || isCanvasRuntimeMock()) {
    const creds =
      staticCreds ??
      ({
        apiKey: "mock-api-key",
        secret: "mock-secret",
        passphrase: "mock-pass",
        address: input.address,
      } satisfies PolymarketL2Credentials);

    const ttl = getCanvasConfig().polymarketCredentialCacheTtlSeconds;
    await cacheSet(cacheKey, { ...creds, cached_at: new Date().toISOString() }, ttl);
    return creds;
  }

  // L1 derive: warm Privy account for future EIP-712 signing; L2 creds from env in v1.
  await getWarmPrivyViemAccount(input);
  const fromEnv = readDevStaticCredentials(input.address);
  if (!fromEnv) {
    throw new AppError(
      503,
      "POLYMARKET_CREDS_MISSING",
      "Polymarket L2 credentials not configured. Set POLYMARKET_BUILDER_API_* or enable CANVAS_RUNTIME_MOCK.",
    );
  }

  const ttl = getCanvasConfig().polymarketCredentialCacheTtlSeconds;
  await cacheSet(cacheKey, { ...fromEnv, cached_at: new Date().toISOString() }, ttl);
  return fromEnv;
}

export function buildPolymarketL2Headers(
  creds: PolymarketL2Credentials,
  method: string,
  requestPath: string,
  body = "",
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = timestamp + method.toUpperCase() + requestPath + body;
  const signature = createHmac("sha256", Buffer.from(creds.secret, "base64"))
    .update(message)
    .digest("base64");

  return {
    POLY_ADDRESS: creds.address,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: timestamp,
    POLY_API_KEY: creds.apiKey,
    POLY_PASSPHRASE: creds.passphrase,
  };
}

export function getPolymarketBuilderCode(): string | undefined {
  const code = optional("POLYMARKET_BUILDER_CODE", "").trim();
  return code || undefined;
}
