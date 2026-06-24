import { getEnabledLifiChainIds, LIFI_SOLANA_CHAIN_ID, LIFI_SUI_CHAIN_ID } from "../../../../../config/lifi-chains.js";
import { getEnabledEvmChainIds } from "../../../../../config/evm.js";
import { formatEnabledBridgeDestinationHint } from "../../../../../services/defi/lifi/lifi-endpoint-params.js";

export function buildLifiEnvLines(): string[] {
  const lifiIds = getEnabledLifiChainIds();
  const evmIds = getEnabledEvmChainIds().join(", ");
  return [
    `Li-Fi cross-chain bridging enabled for chain ids: ${lifiIds.join(", ")} (Sui ${LIFI_SUI_CHAIN_ID}, Solana ${LIFI_SOLANA_CHAIN_ID}, EVM ${evmIds}).`,
    "Use chain_id sui, solana, or ethereum for cross_chain_* queries.",
    `Bridge destinations on this deployment: ${formatEnabledBridgeDestinationHint()}.`,
    "Named EVM chains like Base or Arbitrum are NOT chain_id values — use to_chain_id ethereum plus to_evm_chain_id or destination_evm slug.",
    "Stellar ↔ other ecosystems is not supported via Li-Fi — use Soroswap on Stellar only.",
    "Always pass from_address = the user's agent wallet on the source chain when quoting.",
  ];
}
