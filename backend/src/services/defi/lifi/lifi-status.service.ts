import { isLifiEnabled } from "../../../config/lifi.js";
import { AppError } from "../../../errors/app-error.js";
import { assertEnabledLifiEvmChain } from "./lifi-chain-map.js";
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

  assertEnabledLifiEvmChain(input.from_evm_chain_id);
  assertEnabledLifiEvmChain(input.to_evm_chain_id);
  await consumeLifiStatusQuota(privyUserId, input.tx_hash);

  const cacheKey = lifiStatusCacheKey(
    input.tx_hash,
    input.from_evm_chain_id,
    input.to_evm_chain_id,
  );

  return lifiCachedStatusFetch(cacheKey, async () => {
    const status = await lifiSdk.getStatus({
      txHash: input.tx_hash,
      fromChain: input.from_evm_chain_id,
      toChain: input.to_evm_chain_id,
      ...(input.bridge ? { bridge: input.bridge } : {}),
    });

    return normalizeLifiStatus({
      status,
      txHash: input.tx_hash,
      fromEvmChainId: input.from_evm_chain_id,
      toEvmChainId: input.to_evm_chain_id,
    });
  });
}
