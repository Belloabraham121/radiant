/** Agent wallet chain families — must match backend `CHAIN_IDS`. */
export const AGENT_CHAIN_IDS = ["sui", "ethereum", "solana", "stellar"] as const;

export type AgentChainId = (typeof AGENT_CHAIN_IDS)[number];

const CHAIN_ID_SET = new Set<string>(AGENT_CHAIN_IDS);

function parseChainList(raw: string | undefined): AgentChainId[] {
  if (!raw?.trim()) {
    return ["sui"];
  }

  const parsed: AgentChainId[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim().toLowerCase();
    if (CHAIN_ID_SET.has(id)) {
      parsed.push(id as AgentChainId);
    }
  }

  return parsed.length > 0 ? parsed : ["sui"];
}

/** Chains the client provisions after login. Mirror backend `ENABLED_CHAINS`. */
export function getEnabledAgentChainIds(): AgentChainId[] {
  return parseChainList(process.env.NEXT_PUBLIC_ENABLED_AGENT_CHAINS);
}

/** Primary chain for balances/UI. Mirror backend `DEFAULT_AGENT_CHAIN`. */
export function getDefaultAgentChainId(): AgentChainId {
  const preferred = process.env.NEXT_PUBLIC_DEFAULT_AGENT_CHAIN?.trim().toLowerCase();
  const enabled = getEnabledAgentChainIds();
  if (preferred && CHAIN_ID_SET.has(preferred) && enabled.includes(preferred as AgentChainId)) {
    return preferred as AgentChainId;
  }
  return enabled[0] ?? "sui";
}

/** Privy `chainType` on linked accounts / createWallet for each family. */
export function privyChainTypeFor(chainId: AgentChainId): string {
  return chainId;
}
