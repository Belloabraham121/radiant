import { AppError } from "../../../../../errors/app-error.js";
import { executeSoroswapSwap } from "../../../../defi/soroswap/soroswap-execute.service.js";
import { getSoroswapExecuteContext } from "../../../../defi/soroswap/soroswap-execute-context.js";
import { soroswapExecuteInputSchema } from "../../../../defi/soroswap/soroswap.types.js";
import {
  executeSignedStellarTransaction,
  parseTransactionXdr,
  type StellarTxResult,
} from "../../../../wallet/stellar-transaction.service.js";
import { resolveAgentWalletByPrivyUserId } from "../../../../wallet/agent-wallet.service.js";

export const STELLAR_SOROSWAP_EXECUTE_ACTIONS = ["stellar_swap"] as const;

export const STELLAR_SOROSWAP_EXECUTE_SCHEMA = {
  actionDescription: "stellar_swap (Soroswap — Stellar same-chain swaps).",
  paramsDescription:
    "stellar_swap: { quote_id or route_id (required unless transaction_xdr), token_in, token_out, amount, trade_type?, slippage? } — " +
    "snapshot fields from stellar_swap_quote for approval display and re-quote if the cache expires. " +
    "Or { transaction_xdr } — pre-built unsigned XDR to sign and submit directly.",
};

export function isSoroswapExecuteAction(action: string): boolean {
  return action === "stellar_swap";
}

function readTransactionXdr(params: Record<string, unknown>): string | null {
  const raw = params.transaction_xdr ?? params.unsigned_xdr ?? params.xdr;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

async function resolveSigningWallet(privyUserId: string) {
  const agentWallet = await resolveAgentWalletByPrivyUserId(privyUserId, "stellar");
  if (!agentWallet) {
    throw new AppError(404, "WALLET_NOT_FOUND", "Stellar agent wallet not registered");
  }
  if (!agentWallet.signer_added) {
    throw new AppError(
      403,
      "WALLET_SIGNER_NOT_CONFIGURED",
      "Session signer has not been added to the agent wallet",
    );
  }
  return agentWallet;
}

async function executePrebuiltXdr(
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<StellarTxResult> {
  const xdr = readTransactionXdr(params);
  if (!xdr) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "params.transaction_xdr (or unsigned_xdr) is required",
    );
  }

  const agentWallet = await resolveSigningWallet(privyUserId);
  const transaction = parseTransactionXdr(xdr);
  return executeSignedStellarTransaction({
    privyWalletId: agentWallet.privy_wallet_id,
    stellarAddress: agentWallet.address,
    transaction,
    simulate: params.simulate !== false,
  });
}

/** Execute a Soroswap Stellar swap — quote reference or pre-built XDR. */
export async function executeStellarSoroswapAction(
  privyUserId: string,
  action: string,
  params: Record<string, unknown>,
): Promise<StellarTxResult> {
  if (action !== "stellar_swap") {
    throw new AppError(400, "UNSUPPORTED_ACTION", `Unsupported Soroswap action: ${action}`);
  }

  if (readTransactionXdr(params)) {
    return executePrebuiltXdr(privyUserId, params);
  }

  const parsed = soroswapExecuteInputSchema.parse(params);
  const streamCtx = getSoroswapExecuteContext();
  const result = await executeSoroswapSwap(privyUserId, parsed, {
    ...(streamCtx?.transactionId ? { transactionId: streamCtx.transactionId } : {}),
    sessionId: streamCtx?.sessionId ?? null,
  });

  const effectsStatus =
    result.effects_status === "pending" ? "unknown" : result.effects_status;
  return {
    hash: result.tx_hash,
    stellar_address: result.stellar_address,
    effects_status: effectsStatus,
  };
}
