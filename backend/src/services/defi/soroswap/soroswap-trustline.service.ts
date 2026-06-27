import { optional } from "../../../config/optional-env.js";

/** Whether gasless USDC trustline sponsorship is configured. */
export function isSoroswapGaslessTrustlineEnabled(): boolean {
  return optional("SOROSWAP_SPONSOR_SECRET", "").trim().length > 0;
}

/**
 * Ensure the agent wallet has a trustline for the swap output asset.
 * TODO(Phase 2.6+): implement Soroswap gasless trustline when `SOROSWAP_SPONSOR_SECRET` is set.
 */
export async function ensureSoroswapTrustline(
  _privyUserId: string,
  _assetSymbol: string,
): Promise<void> {
  // Stub — trustline sponsorship requires sponsor account wiring; defer to execute UX path.
}
