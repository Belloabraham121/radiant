import { isSoroswapEnabled } from "../../../config/soroswap.js";
import { resolveTokenSymbol } from "../../../config/supported-tokens.js";
import type { ExecuteTransactionInput } from "../../chains/types.js";
import { applySoroswapQuoteToExecuteParams } from "../../agent-transaction/approval-preview/enrichers/soroswap-route-params.js";
import { recordPendingApproval } from "../../agent-transaction/agent-transaction.service.js";
import { getSoroswapQuote } from "../../defi/soroswap/soroswap-quote.service.js";
import { normalizeSoroswapQuote } from "../../defi/soroswap/soroswap-normalize.js";
import type { SoroswapQuoteInput } from "../../defi/soroswap/soroswap.types.js";
import {
  buildStellarRoutingFallbackOffer,
  detectStellarRoutingFallback,
  partialSwapIntentToStellarRoutingIntent,
} from "../../defi/stellar-routing/stellar-routing-fallback.service.js";
import type { StellarRoutingFallbackOffer } from "../../defi/stellar-routing/stellar-routing.types.js";
import { resolveSwapIntentAmount } from "../resolve-intent-amounts.js";
import { AppError } from "../../../errors/app-error.js";
import { mapAgentToolError } from "../../../utils/agent-tool-errors.js";
import type { ExecuteToolOutcome, PendingTransaction, ToolCallRecord } from "../agent.types.js";
import { buildStellarRoutingFallbackPendingFromOffer } from "../transaction-approval.service.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "../query-chain.tool.js";
import { runExecuteTransactionToolWithApproval } from "../tools.js";
import type { ExecuteTransactionContext } from "../execute-transaction-context.js";
import { withDefaultChain } from "./swap-clarification-gaps.js";
import type { ResolvedSwapOutcome } from "./swap-execute.js";
import type { PartialSwapIntent } from "./swap-intent.types.js";
import { isTokenOnChain } from "./token-chain-affinity.js";

const APPROVAL_REPLY =
  "This transaction needs your approval before I can broadcast it. Review the quote and confirm in the dialog.";

export const STELLAR_ROUTING_FALLBACK_SWAP_REPLY =
  "This swap isn't available on that network. Swap on Stellar instead? Confirm in the dialog when it appears.";

type GetSoroswapQuoteFn = typeof getSoroswapQuote;
type CreateStellarRoutingFallbackPendingFn = (
  privyUserId: string,
  offer: StellarRoutingFallbackOffer,
  context?: ExecuteTransactionContext,
) => Promise<PendingTransaction>;

let getSoroswapQuoteOverride: GetSoroswapQuoteFn | null = null;
let createStellarRoutingFallbackPendingOverride: CreateStellarRoutingFallbackPendingFn | null =
  null;

export function setGetSoroswapQuoteForStellarSwapTests(fn: GetSoroswapQuoteFn | null): void {
  getSoroswapQuoteOverride = fn;
}

export function setCreateStellarRoutingFallbackPendingForTests(
  fn: CreateStellarRoutingFallbackPendingFn | null,
): void {
  createStellarRoutingFallbackPendingOverride = fn;
}

function callGetSoroswapQuote(
  privyUserId: string,
  input: SoroswapQuoteInput,
): Promise<Awaited<ReturnType<typeof getSoroswapQuote>>> {
  if (getSoroswapQuoteOverride) {
    return getSoroswapQuoteOverride(privyUserId, input);
  }
  return getSoroswapQuote(privyUserId, input);
}

function displayAmountToStroops(amount: number, symbol: string): string | null {
  try {
    const resolved = resolveTokenSymbol("stellar", symbol);
    if (resolved.match !== "exact") {
      return null;
    }
    const decimals = resolved.token.decimals;
    const factor = 10 ** decimals;
    const atomic = BigInt(Math.floor(amount * factor));
    if (atomic <= 0n) {
      return null;
    }
    return atomic.toString();
  } catch {
    return null;
  }
}

/** Whether this resolved swap intent should execute via Soroswap on Stellar. */
export function isStellarSwapEligible(intent: PartialSwapIntent): boolean {
  if (!isSoroswapEnabled()) {
    return false;
  }

  const resolved = withDefaultChain(intent);
  if (resolved.chainId !== "stellar") {
    return false;
  }
  if (!resolved.inputCoin || !resolved.outputCoin) {
    return false;
  }

  return (
    isTokenOnChain(resolved.inputCoin, "stellar") &&
    isTokenOnChain(resolved.outputCoin, "stellar")
  );
}

export function buildStellarSwapQuoteParams(intent: PartialSwapIntent): SoroswapQuoteInput | null {
  const resolved = withDefaultChain(intent);
  if (!resolved.inputCoin || !resolved.outputCoin || resolved.amount === undefined) {
    return null;
  }

  const side = resolved.amountSide ?? "pay";
  const amountSymbol = side === "receive" ? resolved.outputCoin : resolved.inputCoin;
  const amountAtomic = displayAmountToStroops(resolved.amount, amountSymbol);
  if (!amountAtomic) {
    return null;
  }

  return {
    token_in: resolved.inputCoin,
    token_out: resolved.outputCoin,
    amount: amountAtomic,
    trade_type: side === "receive" ? "EXACT_OUT" : "EXACT_IN",
  };
}

function buildStellarSwapExecuteInput(params: Record<string, unknown>): ExecuteTransactionInput {
  return {
    chain_id: "stellar",
    action: "stellar_swap",
    params,
  };
}

async function createPendingFromStellarRoutingFallbackOffer(
  privyUserId: string,
  offer: StellarRoutingFallbackOffer,
  context?: ExecuteTransactionContext,
): Promise<PendingTransaction> {
  if (createStellarRoutingFallbackPendingOverride) {
    return createStellarRoutingFallbackPendingOverride(privyUserId, offer, context);
  }

  const executeInput = buildStellarSwapExecuteInput({
    token_in: offer.token_in,
    token_out: offer.token_out,
    amount: offer.amount,
  });
  const pending = buildStellarRoutingFallbackPendingFromOffer(executeInput, offer);

  await recordPendingApproval({
    privyUserId,
    sessionId: context?.sessionId,
    messageId: context?.messageId,
    workflowStepIndex: context?.workflowStepIndex,
    input: {
      chain_id: pending.chain_id,
      action: pending.action,
      params: pending.params,
    },
    pending,
  });

  return pending;
}

/** Offer Stellar routing fallback when tokens are Stellar-only but the wrong chain was selected. */
export async function executeStellarRoutingFallbackOffer(
  privyUserId: string,
  intent: PartialSwapIntent,
  sessionId?: string,
): Promise<ResolvedSwapOutcome | null> {
  if (!detectStellarRoutingFallback(intent)) {
    return null;
  }

  let resolvedIntent: PartialSwapIntent;
  try {
    resolvedIntent = await resolveSwapIntentAmount(intent);
  } catch (err) {
    const mapped = mapAgentToolError(err);
    return {
      reply: mapped instanceof AppError ? mapped.message : "Could not resolve the swap amount.",
      tool_calls: [],
      pending_transaction: null,
    };
  }

  const quoteParams = buildStellarSwapQuoteParams(resolvedIntent);
  if (!quoteParams) {
    return null;
  }

  const routingIntent = partialSwapIntentToStellarRoutingIntent(resolvedIntent, quoteParams.amount);
  if (!routingIntent) {
    return null;
  }

  let offer: StellarRoutingFallbackOffer;
  try {
    offer = await buildStellarRoutingFallbackOffer(privyUserId, routingIntent);
  } catch (err) {
    const mapped = mapAgentToolError(err);
    return {
      reply:
        mapped instanceof AppError
          ? mapped.message
          : "Stellar routing fallback is not available right now.",
      tool_calls: [],
      pending_transaction: null,
    };
  }

  const pending = await createPendingFromStellarRoutingFallbackOffer(privyUserId, offer, {
    sessionId,
  });

  return {
    reply: STELLAR_ROUTING_FALLBACK_SWAP_REPLY,
    tool_calls: [],
    pending_transaction: pending,
  };
}

export async function executeResolvedStellarSwap(
  privyUserId: string,
  intent: PartialSwapIntent,
  sessionId?: string,
): Promise<ResolvedSwapOutcome | null> {
  if (!isSoroswapEnabled()) {
    return {
      reply: "Stellar swaps are not enabled on this deployment.",
      tool_calls: [],
      pending_transaction: null,
    };
  }

  let resolvedIntent: PartialSwapIntent;
  try {
    resolvedIntent = await resolveSwapIntentAmount(intent);
  } catch (err) {
    const mapped = mapAgentToolError(err);
    return {
      reply: mapped instanceof AppError ? mapped.message : "Could not resolve the swap amount.",
      tool_calls: [],
      pending_transaction: null,
    };
  }

  const quoteParams = buildStellarSwapQuoteParams(resolvedIntent);
  if (!quoteParams) {
    return null;
  }

  const tool_calls: ToolCallRecord[] = [];
  let quoteResult: Awaited<ReturnType<typeof getSoroswapQuote>>;

  try {
    quoteResult = await callGetSoroswapQuote(privyUserId, quoteParams);
  } catch (err) {
    const mapped = mapAgentToolError(err);
    return {
      reply:
        mapped instanceof AppError
          ? mapped.message
          : "Could not quote this swap — check the tokens and amount, then try again.",
      tool_calls: [
        {
          name: QUERY_CHAIN_TOOL_NAME,
          query: "stellar_swap_quote",
          result: {
            error: {
              code: mapped instanceof AppError ? mapped.code : "SWAP_QUOTE_FAILED",
              message: mapped instanceof AppError ? mapped.message : String(mapped),
            },
          },
        },
      ],
      pending_transaction: null,
    };
  }

  const quote = normalizeSoroswapQuote({
    token_in: quoteParams.token_in,
    token_out: quoteParams.token_out,
    quote_id: quoteResult.quote_id,
    quote: quoteResult.quote,
  });

  tool_calls.push({
    name: QUERY_CHAIN_TOOL_NAME,
    query: "stellar_swap_quote",
    result: {
      chain_id: "stellar",
      ...quote,
      expires_at: quote.expires_at ?? quoteResult.expires_at,
    },
  });

  const executeParams = applySoroswapQuoteToExecuteParams(
    {
      token_in: quoteParams.token_in,
      token_out: quoteParams.token_out,
      amount: quoteParams.amount,
      trade_type: quoteParams.trade_type,
    },
    quote,
  );

  const executeInput = buildStellarSwapExecuteInput(executeParams);

  let executeOutcome: ExecuteToolOutcome;
  try {
    executeOutcome = await runExecuteTransactionToolWithApproval(
      privyUserId,
      executeInput,
      { sessionId },
    );
  } catch (err) {
    const mapped = mapAgentToolError(err);
    tool_calls.push({
      name: EXECUTE_TRANSACTION_TOOL_NAME,
      result: {
        error: {
          code: mapped instanceof AppError ? mapped.code : "SWAP_EXECUTE_FAILED",
          message: mapped instanceof AppError ? mapped.message : String(mapped),
        },
      },
    });
    return {
      reply: mapped instanceof AppError ? mapped.message : "Swap could not be submitted.",
      tool_calls,
      pending_transaction: null,
    };
  }

  tool_calls.push({
    name: EXECUTE_TRANSACTION_TOOL_NAME,
    result: executeOutcome,
  });

  if (executeOutcome.status === "stellar_routing_fallback_offered") {
    return {
      reply: STELLAR_ROUTING_FALLBACK_SWAP_REPLY,
      tool_calls,
      pending_transaction: executeOutcome.pending,
    };
  }

  if (executeOutcome.status === "approval_required") {
    return {
      reply: APPROVAL_REPLY,
      tool_calls,
      pending_transaction: executeOutcome.pending,
    };
  }

  const amount = resolvedIntent.amount ?? 0;
  const digest =
    executeOutcome.status === "executed" && executeOutcome.result?.digest
      ? ` Digest: ${executeOutcome.result.digest}.`
      : "";

  return {
    reply:
      `Swap submitted: ${amount} ${resolvedIntent.inputCoin} → ~${quote.output_amount_display} ${resolvedIntent.outputCoin} on Stellar.${digest}`,
    tool_calls,
    pending_transaction: null,
  };
}
