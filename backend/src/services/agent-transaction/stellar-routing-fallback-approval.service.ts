import { AppError } from "../../errors/app-error.js";
import type { ExecuteTransactionInput } from "../chains/types.js";
import type { PendingTransaction } from "../agent/agent.types.js";
import { createPendingTransaction } from "../agent/transaction-approval.service.js";
import {
  acceptStellarRoutingFallback,
  rejectStellarRoutingFallback,
} from "../defi/stellar-routing/stellar-routing-fallback.service.js";
import { getStellarRoutingFallbackOffer } from "../defi/stellar-routing/stellar-routing-fallback-cache.js";
import type { StellarRoutingFallbackQuoteParams } from "../defi/stellar-routing/stellar-routing.types.js";
import { findPendingApprovalSessionIdByStellarRoutingFallbackOfferId } from "./agent-transaction.repository.js";
import { emitSoroswapQuoteStep } from "../agent/agent-stream-stellar.js";
import { applySoroswapQuoteToExecuteParams } from "./approval-preview/enrichers/soroswap-route-params.js";
import { normalizeSoroswapQuote } from "../defi/soroswap/soroswap-normalize.js";

function stellarRoutingQuoteToExecuteInput(
  quote: Awaited<ReturnType<typeof acceptStellarRoutingFallback>>,
  quoteParams: StellarRoutingFallbackQuoteParams,
): ExecuteTransactionInput {
  const normalized = normalizeSoroswapQuote({
    token_in: quoteParams.token_in,
    token_out: quoteParams.token_out,
    quote_id: quote.quote_id,
    quote: quote.quote,
  });

  const executeParams = applySoroswapQuoteToExecuteParams(
    {
      token_in: quoteParams.token_in,
      token_out: quoteParams.token_out,
      amount: quoteParams.amount,
      ...(quoteParams.trade_type ? { trade_type: quoteParams.trade_type } : {}),
      ...(quoteParams.slippage !== undefined ? { slippage: quoteParams.slippage } : {}),
    },
    normalized,
  );

  return {
    chain_id: "stellar",
    action: "stellar_swap",
    params: executeParams,
  };
}

export type AcceptStellarRoutingFallbackApiResult = {
  status: "approval_required";
  pending: PendingTransaction;
  agent_transaction_id: string;
  quote_id: string;
};

export type RejectStellarRoutingFallbackApiResult = {
  status: "rejected";
  fallback_offer_id: string;
};

/** User accepted Stellar routing fallback — fetch Soroswap quote and queue swap approval. */
export async function acceptStellarRoutingFallbackForApproval(
  privyUserId: string,
  fallbackOfferId: string,
): Promise<AcceptStellarRoutingFallbackApiResult> {
  const sessionId = await findPendingApprovalSessionIdByStellarRoutingFallbackOfferId(
    privyUserId,
    fallbackOfferId,
  );

  emitSoroswapQuoteStep(sessionId, { status: "running", fallback_offer_id: fallbackOfferId });

  let quoteResult: Awaited<ReturnType<typeof acceptStellarRoutingFallback>>;
  try {
    quoteResult = await acceptStellarRoutingFallback(privyUserId, fallbackOfferId);
  } catch (err) {
    emitSoroswapQuoteStep(sessionId, {
      status: "failed",
      fallback_offer_id: fallbackOfferId,
      detail: err instanceof AppError ? err.message : "Could not fetch Stellar swap quote",
    });
    throw err instanceof AppError
      ? err
      : new AppError(500, "INTERNAL_ERROR", "Could not fetch Stellar swap quote.");
  }

  const stored = await getStellarRoutingFallbackOffer(fallbackOfferId);
  if (!stored) {
    emitSoroswapQuoteStep(sessionId, {
      status: "failed",
      fallback_offer_id: fallbackOfferId,
      detail: "Stellar routing fallback offer expired or was not found",
    });
    throw new AppError(
      404,
      "FALLBACK_OFFER_NOT_FOUND",
      "Stellar routing fallback offer expired or was not found.",
    );
  }

  emitSoroswapQuoteStep(sessionId, {
    status: "ok",
    token_in: stored.quoteParams.token_in,
    token_out: stored.quoteParams.token_out,
    fallback_offer_id: fallbackOfferId,
  });

  const executeInput = stellarRoutingQuoteToExecuteInput(quoteResult, stored.quoteParams);

  const pending = await createPendingTransaction(privyUserId, executeInput, {
    ...(sessionId ? { sessionId } : {}),
  });

  return {
    status: "approval_required",
    pending,
    agent_transaction_id: pending.id,
    quote_id: quoteResult.quote_id,
  };
}

/** User declined Stellar routing fallback offer. */
export async function rejectStellarRoutingFallbackForApproval(
  privyUserId: string,
  fallbackOfferId: string,
): Promise<RejectStellarRoutingFallbackApiResult> {
  await rejectStellarRoutingFallback(privyUserId, fallbackOfferId);
  return {
    status: "rejected",
    fallback_offer_id: fallbackOfferId,
  };
}
