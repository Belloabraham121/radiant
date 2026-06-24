import { getEnabledEvmChainIds } from "../../../../../config/evm.js";

export function buildLifiEnvLines(): string[] {
  const chains = getEnabledEvmChainIds().join(", ");
  return [
    `Li-Fi cross-chain bridging is enabled on EVM networks: ${chains}. Use chain_id ethereum with params.evm_chain_id for each network.`,
    "Radiant v1 bridges only between enabled EVM chains (Ethereum, Arbitrum, Base). Stellar ↔ EVM is not supported.",
    "Always pass from_address = the user's agent wallet when quoting. Use token_resolve before cross_chain_quote when the user names a token informally.",
  ];
}
