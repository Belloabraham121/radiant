import { filterEnabledEvmChainIds } from "../../../config/supported-tokens.js";
import { getEnabledEvmChainIds } from "../../../config/evm.js";
import { isLifiEnabled } from "../../../config/lifi.js";
import { AppError } from "../../../errors/app-error.js";
import { lifiSdk } from "./lifi.client.js";
import { lifiCachedCatalogFetch, lifiConnectionsCacheKey } from "./lifi-cache.js";
import { consumeLifiOutboundQuota } from "./lifi-rate-limit.js";
import { assertEnabledLifiEvmChain } from "./lifi-chain-map.js";
import type { BasicConnection } from "@lifi/types";

export type LifiConnectionsInput = {
  fromEvmChainId?: number;
  toEvmChainId?: number;
};

function connectionPairs(input: LifiConnectionsInput): Array<{ from: number; to: number }> {
  const enabled = getEnabledEvmChainIds();
  const fromChains =
    input.fromEvmChainId !== undefined ? [input.fromEvmChainId] : enabled;
  const toChains = input.toEvmChainId !== undefined ? [input.toEvmChainId] : enabled;

  const pairs: Array<{ from: number; to: number }> = [];
  for (const from of fromChains) {
    for (const to of toChains) {
      if (from !== to) {
        pairs.push({ from, to });
      }
    }
  }
  return pairs;
}

export async function getLifiConnections(userId: string, input: LifiConnectionsInput = {}) {
  if (!isLifiEnabled()) {
    throw new AppError(503, "LIFI_UNAVAILABLE", "Li-Fi is not enabled on this deployment.");
  }

  if (input.fromEvmChainId !== undefined) {
    assertEnabledLifiEvmChain(input.fromEvmChainId);
  }
  if (input.toEvmChainId !== undefined) {
    assertEnabledLifiEvmChain(input.toEvmChainId);
  }

  await consumeLifiOutboundQuota(userId);

  const cacheKey = `${lifiConnectionsCacheKey()}:${input.fromEvmChainId ?? "any"}:${input.toEvmChainId ?? "any"}`;

  return lifiCachedCatalogFetch(cacheKey, async () => {
    const pairs = connectionPairs(input);
    const merged = new Map<string, BasicConnection>();

    for (const pair of pairs) {
      const response = await lifiSdk.getConnections({
        fromChain: pair.from,
        toChain: pair.to,
      });

      for (const connection of response.connections) {
        const fromOk = filterEnabledEvmChainIds([connection.fromChainId]).length === 1;
        const toOk = filterEnabledEvmChainIds([connection.toChainId]).length === 1;
        if (!fromOk || !toOk) {
          continue;
        }
        const key = `${connection.fromChainId}:${connection.toChainId}`;
        merged.set(key, connection);
      }
    }

    return { connections: [...merged.values()] };
  });
}
