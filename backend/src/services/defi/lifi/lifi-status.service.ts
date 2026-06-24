import { resolveLifiChainRef } from "../../../config/lifi-chains.js";
import { isLifiEnabled } from "../../../config/lifi.js";
import { AppError } from "../../../errors/app-error.js";
import { radiantToLifiChainId } from "./lifi-chain-map.js";
import { lifiSdk } from "./lifi.client.js";
import { lifiCachedStatusFetch, lifiStatusCacheKey } from "./lifi-cache.js";
import { consumeLifiStatusQuota } from "./lifi-rate-limit.js";
import { normalizeLifiStatus } from "./lifi-normalize.js";
import type { CrossChainStatusResult, LifiStatusInput } from "./lifi.types.js";

export async function getLifiCrossChainStatus(
  privyUserId: string,
  input: LifiStatusInput,
): Promise<CrossChainStatusResult> {
  if (!isLifiEnabled()) {
    throw new AppError(503, "LIFI_UNAVAILABLE", "Li-Fi is not enabled on this deployment.");
  }

  const from = resolveLifiChainRef({
    chain_id: input.from_chain_id,
    evm_chain_id: input.from_evm_chain_id,
  });
  const to = resolveLifiChainRef({
    chain_id: input.to_chain_id,
    evm_chain_id: input.to_evm_chain_id,
  });

  const fromLifiChainId = radiantToLifiChainId(from);
  const toLifiChainId = radiantToLifiChainId(to);

  await consumeLifiStatusQuota(privyUserId, input.tx_hash);

  const cacheKey = lifiStatusCacheKey(input.tx_hash, fromLifiChainId, toLifiChainId);

  return lifiCachedStatusFetch(cacheKey, async () => {
    const status = await lifiSdk.getStatus({
      txHash: input.tx_hash,
      fromChain: fromLifiChainId,
      toChain: toLifiChainId,
      ...(input.bridge ? { bridge: input.bridge } : {}),
    });

    return normalizeLifiStatus({
      status,
      txHash: input.tx_hash,
      from,
      to,
    });
  });
}
