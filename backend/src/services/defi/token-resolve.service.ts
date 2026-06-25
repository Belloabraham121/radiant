import { getDefiCacheConfig } from "../../config/defi-cache.js";
import {
  assertCrossEcosystemSupported,
  getSupportedChains,
  hashTokenResolveInput,
  resolveTokenSymbol,
  type TokenResolveExact,
  type TokenResolveResult,
} from "../../config/supported-tokens.js";
import { tryConsumeTokenBucket } from "../../infrastructure/rate-limit/token-bucket.js";
import { cacheGet, cacheSet } from "../../infrastructure/redis/cache.js";
import { AppError } from "../../errors/app-error.js";
import type { ChainId } from "../chains/types.js";
import { applyTtlJitter, defiTokenResolveCacheKey } from "./cache.js";

export type TokenResolveQueryInput = {
  chain_id: ChainId;
  symbol: string;
  evm_chain_id?: number;
  to_chain_id?: ChainId;
  to_evm_chain_id?: number;
};

async function consumeTokenResolveQuota(privyUserId: string): Promise<void> {
  const config = getDefiCacheConfig();
  const allowed = await tryConsumeTokenBucket(
    `defi:token_resolve:${privyUserId}`,
    {
      capacity: config.tokenResolveRateLimitCapacity,
      refillIntervalMs: config.tokenResolveRateLimitRefillMs,
    },
  );

  if (!allowed) {
    throw new AppError(
      429,
      "RATE_LIMITED",
      "token_resolve quota exceeded (60/min). Try again shortly.",
    );
  }
}

/** Agent `query_chain` token_resolve — rate limited; exact matches cached with jitter. */
export async function queryTokenResolve(
  privyUserId: string,
  input: TokenResolveQueryInput,
): Promise<TokenResolveResult> {
  await consumeTokenResolveQuota(privyUserId);

  if (input.to_chain_id) {
    assertCrossEcosystemSupported(input.chain_id, input.to_chain_id);
  }

  const inputHash = hashTokenResolveInput(input.chain_id, input.symbol, input.evm_chain_id);
  const cacheKey = defiTokenResolveCacheKey(input.chain_id, inputHash, input.evm_chain_id);
  const ttl = getDefiCacheConfig().tokenResolveCacheTtlSeconds;

  const cached = await cacheGet<TokenResolveExact>(cacheKey);
  if (cached?.match === "exact") {
    return cached;
  }

  const result = resolveTokenSymbol(input.chain_id, input.symbol, input.evm_chain_id);
  if (result.match === "exact") {
    await cacheSet(cacheKey, result, applyTtlJitter(ttl));
  }

  return result;
}

export function querySupportedChains(): { chains: ReturnType<typeof getSupportedChains> } {
  return { chains: getSupportedChains() };
}
