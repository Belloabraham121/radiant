import { getDefaultAgentChainId } from "./chains.js";
import type { ChainId } from "../services/chains/types.js";

function parsePositiveNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Human-readable max auto-approved native amount per chain (no modal). */
export function getAutoApproveMaxDisplay(chainId: ChainId): number {
  switch (chainId) {
    case "sui":
      return parsePositiveNumber("AGENT_AUTO_APPROVE_MAX_SUI", 25);
    case "ethereum":
      return parsePositiveNumber("AGENT_AUTO_APPROVE_MAX_ETH", 25);
    case "solana":
      return parsePositiveNumber("AGENT_AUTO_APPROVE_MAX_SOL", 25);
    default:
      return 25;
  }
}

/** Smallest-unit threshold for transfer approval checks. */
export function getAutoApproveMaxAtomic(chainId: ChainId): bigint {
  const display = getAutoApproveMaxDisplay(chainId);
  switch (chainId) {
    case "sui":
      return BigInt(Math.floor(display * 1_000_000_000));
    case "ethereum":
      return BigInt(Math.floor(display * 1e18));
    case "solana":
      return BigInt(Math.floor(display * 1_000_000_000));
    default:
      return BigInt(0);
  }
}

export function getAnthropicConfig() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || "";
  return {
    apiKey,
    enabled: apiKey.length > 0,
    model: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-20250514",
    defaultChainId: getDefaultAgentChainId(),
  };
}
