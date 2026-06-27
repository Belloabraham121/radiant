import { optional } from "../../../config/optional-env.js";
import { AppError } from "../../../errors/app-error.js";

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
  assetSymbol: string,
): Promise<void> {
  const symbol = assetSymbol.trim().toUpperCase();
  if (symbol === "XLM" || symbol === "NATIVE") {
    return;
  }

  if (isSoroswapGaslessTrustlineEnabled()) {
    throw new AppError(
      501,
      "SOROSWAP_TRUSTLINE_REQUIRED",
      "Trustline sponsorship is not wired yet. Open a trustline for this asset before swapping.",
    );
  }

  throw new AppError(
    400,
    "SOROSWAP_TRUSTLINE_REQUIRED",
    "Missing trustline for this asset. Open a trustline first or use a gasless trustline flow when available.",
  );
}
