import type { AgentChainId } from "@/lib/agent-chains";

/** Server signer quorum — must match `PRIVY_SIGNER_QUORUM_ID` on the backend. */
export function getSignerQuorumId(): string | undefined {
  const id = process.env.NEXT_PUBLIC_PRIVY_SIGNER_QUORUM_ID?.trim();
  return id || undefined;
}

/** Optional Sui policy — must match `PRIVY_SUI_POLICY_ID` on the backend. */
export function getSuiPolicyId(): string | undefined {
  const id = process.env.NEXT_PUBLIC_PRIVY_SUI_POLICY_ID?.trim();
  return id || undefined;
}

/** Optional EVM policy — must match `PRIVY_EVM_POLICY_ID` on the backend. */
export function getEvmPolicyId(): string | undefined {
  const id = process.env.NEXT_PUBLIC_PRIVY_EVM_POLICY_ID?.trim();
  return id || undefined;
}

/** Optional Solana policy — must match `PRIVY_SOLANA_POLICY_ID` on the backend. */
export function getSolanaPolicyId(): string | undefined {
  const id = process.env.NEXT_PUBLIC_PRIVY_SOLANA_POLICY_ID?.trim();
  return id || undefined;
}

/** Optional Stellar policy — must match `PRIVY_STELLAR_POLICY_ID` on the backend. */
export function getStellarPolicyId(): string | undefined {
  const id = process.env.NEXT_PUBLIC_PRIVY_STELLAR_POLICY_ID?.trim();
  return id || undefined;
}

/** Per-chain-family policy ID for `addSigners`. */
export function getPolicyIdForChain(chainId: AgentChainId): string | undefined {
  switch (chainId) {
    case "sui":
      return getSuiPolicyId();
    case "ethereum":
      return getEvmPolicyId();
    case "solana":
      return getSolanaPolicyId();
    case "stellar":
      return getStellarPolicyId();
    default: {
      const _exhaustive: never = chainId;
      return _exhaustive;
    }
  }
}
