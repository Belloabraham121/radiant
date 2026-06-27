import { getSoroswapAllowedSymbols } from "../../../../../config/soroswap-chains.js";
import { isSoroswapEnabled } from "../../../../../config/soroswap.js";

export function buildSoroswapEnvLines(): string[] {
  const enabled = isSoroswapEnabled();
  const symbols = getSoroswapAllowedSymbols().join(", ");
  return [
    enabled
      ? `Stellar same-chain swaps use Soroswap (chain_id: stellar, action: stellar_swap). Allowlisted symbols: ${symbols}.`
      : "Stellar Soroswap swaps are disabled on this deployment — do not call stellar_swap_quote or stellar_swap.",
    "Use chain_id stellar for Stellar queries and executes — not ethereum or sui.",
    "Stellar has no Li-Fi bridge in v1 — never call cross_chain_* for Stellar ↔ EVM/Sui.",
    "Amounts in API requests are stroops (1 XLM = 10^7 stroops); show human XLM/USDC amounts to the user.",
  ];
}
