export type UnsupportedCapability = {
  id: string;
  label: string;
  pattern: RegExp;
};

/** DeepBook / chat features documented in deepbook-v3-TODO but not wired yet. */
export const UNSUPPORTED_CAPABILITIES: UnsupportedCapability[] = [
  {
    id: "governance",
    label: "DeepBook governance voting",
    pattern: /\bgovernance\b|\bvote\s+(yes|no|on)\b.*\b(proposal|deepbook)\b/i,
  },
];

export const SUPPORTED_DEEPBOOK_SUMMARY =
  "swaps, limit/market orders, cancel/modify orders, claim settled proceeds, flash loans (round-trip and multi-step swap_chain_repay bundles — quote via flash_loan_quote, Settings opt-in), DEEP staking and unstaking (deepbook_stake / deepbook_unstake, stake balance via deepbook_stake_balance), open orders, balance manager setup, deposits, withdrawals, wallet and manager balances, pool listings, ticker/pool info, swap quotes, and agent transaction history";

export function detectUnsupportedCapability(message: string): UnsupportedCapability | null {
  for (const capability of UNSUPPORTED_CAPABILITIES) {
    if (capability.pattern.test(message)) {
      return capability;
    }
  }
  return null;
}

export function buildUnsupportedCapabilityNudge(capability: UnsupportedCapability): string {
  return (
    `The user asked about ${capability.label}. Radiant does NOT support this in chat yet — ` +
    `there is no query_chain or execute_transaction action for it. ` +
    `Do not claim you checked, do not say the list is empty, and do not infer from balance manager status. ` +
    `Reply honestly that this feature is not available yet, and briefly mention what you CAN do: ${SUPPORTED_DEEPBOOK_SUMMARY}. ` +
    `Do not call tools for this request — answer in plain language only.`
  );
}

export function isUnsupportedCapabilityNudge(content: string): boolean {
  return content.includes("Radiant does NOT support this in chat yet");
}
