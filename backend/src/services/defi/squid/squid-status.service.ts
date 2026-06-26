import { resolveSquidChainRef } from "../../../config/squid-chains.js";
import { isSquidEnabled, getSquidConfig } from "../../../config/squid.js";
import { AppError } from "../../../errors/app-error.js";
import { squidSdk } from "./squid.client.js";
import { consumeSquidStatusQuota } from "./squid-rate-limit.js";
import { normalizeSquidStatus } from "./squid-normalize.js";
import type {
  SquidChainflipBridgeType,
  SquidCrossChainStatusResult,
  SquidStatusInput,
} from "./squid.types.js";

/** Arbitrum — Chainflip direct bridge uses `bridgeType: chainflip`. */
export const SQUID_CHAINFLIP_ARBITRUM_EVM_CHAIN_ID = 42161;

/** Map destination EVM chain id to Squid CHAINFLIP status `bridgeType`. */
export function resolveSquidBridgeType(
  toEvmChainId: number | undefined,
): SquidChainflipBridgeType | undefined {
  if (toEvmChainId === undefined) {
    return undefined;
  }
  return toEvmChainId === SQUID_CHAINFLIP_ARBITRUM_EVM_CHAIN_ID
    ? "chainflip"
    : "chainflipmultihop";
}

export async function getSquidCrossChainStatus(
  privyUserId: string,
  input: SquidStatusInput,
): Promise<SquidCrossChainStatusResult> {
  if (!isSquidEnabled()) {
    throw new AppError(503, "SQUID_UNAVAILABLE", "Squid is not enabled on this deployment.");
  }

  const from = resolveSquidChainRef({
    chain_id: input.from_chain_id,
    evm_chain_id: input.from_evm_chain_id,
  });
  const to = resolveSquidChainRef({
    chain_id: input.to_chain_id,
    evm_chain_id: input.to_evm_chain_id,
  });

  await consumeSquidStatusQuota(privyUserId, input.transaction_id);

  const config = getSquidConfig();
  const status = await squidSdk.getStatus({
    transactionId: input.transaction_id,
    quoteId: input.quote_id,
    ...(input.request_id ? { requestId: input.request_id } : {}),
    integratorId: config.integratorId,
    ...(input.bridge_type ? { bridgeType: input.bridge_type } : {}),
  });

  return normalizeSquidStatus({
    status,
    transactionId: input.transaction_id,
    quoteId: input.quote_id,
    from,
    to,
  });
}
