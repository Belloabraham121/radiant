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
import {
  queryBridgeCapabilities as buildBridgeCapabilities,
  type BridgeCapabilitiesResult,
} from "../../config/token-capabilities.js";
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

export type BridgeCapabilitiesQueryInput = {
  from_chain_id: ChainId;
  from_evm_chain_id?: number;
  to_chain_id: ChainId;
  to_evm_chain_id?: number;
  from_token?: string;
};

/** Agent `query_chain` bridge_capabilities — chain-aware receive token options. */
export function queryBridgeCapabilities(
  input: BridgeCapabilitiesQueryInput,
): BridgeCapabilitiesResult {
  if (input.from_chain_id === "ethereum" && input.from_evm_chain_id === undefined) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "bridge_capabilities requires from_evm_chain_id when from_chain_id is ethereum.",
    );
  }
  if (input.to_chain_id === "ethereum" && input.to_evm_chain_id === undefined) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "bridge_capabilities requires to_evm_chain_id when to_chain_id is ethereum.",
    );
  }

  return buildBridgeCapabilities(
    { chain_id: input.from_chain_id, evm_chain_id: input.from_evm_chain_id },
    { chain_id: input.to_chain_id, evm_chain_id: input.to_evm_chain_id },
    input.from_token,
  );
}
