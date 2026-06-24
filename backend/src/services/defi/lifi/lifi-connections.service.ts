import { filterEnabledLifiChainIds } from "../../../config/lifi-chains.js";
import { getEnabledLifiChainIds, resolveLifiChainRef } from "../../../config/lifi-chains.js";
import { isLifiEnabled } from "../../../config/lifi.js";
import { AppError } from "../../../errors/app-error.js";
import { lifiSdk } from "./lifi.client.js";
import { lifiCachedCatalogFetch, lifiConnectionsCacheKey } from "./lifi-cache.js";
import { consumeLifiOutboundQuota } from "./lifi-rate-limit.js";
import { assertEnabledLifiChainRef } from "../../../config/lifi-chains.js";
import { radiantToLifiChainId } from "./lifi-chain-map.js";
import type { BasicConnection } from "@lifi/types";
import type { LifiConnectionsInput } from "./lifi.types.js";

function connectionPairs(input: LifiConnectionsInput): Array<{ from: number; to: number }> {
  const enabled = getEnabledLifiChainIds();

  const fromChains =
    input.from_chain_id !== undefined || input.from_evm_chain_id !== undefined
      ? [radiantToLifiChainId(resolveLifiChainRef({
          chain_id: input.from_chain_id,
          evm_chain_id: input.from_evm_chain_id,
        }))]
      : enabled;

  const toChains =
    input.to_chain_id !== undefined || input.to_evm_chain_id !== undefined
      ? [radiantToLifiChainId(resolveLifiChainRef({
          chain_id: input.to_chain_id,
          evm_chain_id: input.to_evm_chain_id,
        }))]
      : enabled;

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

  if (input.from_chain_id !== undefined || input.from_evm_chain_id !== undefined) {
    assertEnabledLifiChainRef(
      resolveLifiChainRef({
        chain_id: input.from_chain_id,
        evm_chain_id: input.from_evm_chain_id,
      }),
    );
  }
  if (input.to_chain_id !== undefined || input.to_evm_chain_id !== undefined) {
    assertEnabledLifiChainRef(
      resolveLifiChainRef({
        chain_id: input.to_chain_id,
        evm_chain_id: input.to_evm_chain_id,
      }),
    );
  }

  await consumeLifiOutboundQuota(userId);

  const cacheKey = `${lifiConnectionsCacheKey()}:${input.from_chain_id ?? input.from_evm_chain_id ?? "any"}:${input.to_chain_id ?? input.to_evm_chain_id ?? "any"}`;

  return lifiCachedCatalogFetch(cacheKey, async () => {
    const pairs = connectionPairs(input);
    const merged = new Map<string, BasicConnection>();

    for (const pair of pairs) {
      const response = await lifiSdk.getConnections({
        fromChain: pair.from,
        toChain: pair.to,
      });

      for (const connection of response.connections) {
        const fromOk = filterEnabledLifiChainIds([connection.fromChainId]).length === 1;
        const toOk = filterEnabledLifiChainIds([connection.toChainId]).length === 1;
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
