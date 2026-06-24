import { getEnabledLifiChainIds, LIFI_SOLANA_CHAIN_ID, LIFI_SUI_CHAIN_ID } from "../../../../../config/lifi-chains.js";
import { getEnabledEvmChainIds } from "../../../../../config/evm.js";

export function buildLifiEnvLines(): string[] {
  const lifiIds = getEnabledLifiChainIds();
  const evmIds = getEnabledEvmChainIds().join(", ");
  return [
    `Li-Fi cross-chain bridging enabled for chain ids: ${lifiIds.join(", ")} (Sui ${LIFI_SUI_CHAIN_ID}, Solana ${LIFI_SOLANA_CHAIN_ID}, EVM ${evmIds}).`,
    "Use chain_id sui, solana, or ethereum for cross_chain_* queries. Pass from_chain_id / to_chain_id; EVM legs need from_evm_chain_id / to_evm_chain_id.",
    "Stellar ↔ other ecosystems is not supported via Li-Fi — use Soroswap on Stellar only.",
    "Always pass from_address = the user's agent wallet on the source chain when quoting. Use token_resolve before cross_chain_quote when the user names a token informally.",
  ];
}
