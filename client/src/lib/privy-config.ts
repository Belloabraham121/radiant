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
