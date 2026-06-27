"use client";

import { Loader2, ShieldAlert } from "lucide-react";
import type { PendingTransaction } from "@/lib/chat-api";
import { isAlternateCrossChainRoute } from "@/lib/cross-chain-fallback";
import {
  resolveQuoteExpiresAt,
  useSwapQuoteCountdown,
} from "@/hooks/useSwapQuoteCountdown";
import { formatAmountDisplayText, formatDisplayNumber } from "@/lib/format-display-amount";
import { FiatPreviewLines } from "@/components/app/defi/FiatPreviewLines";
import { QuoteExpiryCountdownLabel } from "@/components/app/RouteCountdownLabel";
import {
  DeFiApprovalPreviewCard,
  useDeFiApprovalState,
} from "@/components/app/defi/DeFiApprovalPreview";

export function TransactionApprovalBar({
  pending,
  busy,
  refreshingQuote,
  statusMessage,
  onApprove,
  onCancel,
  onFreshQuote,
  className = "",
}: {
  pending: PendingTransaction;
  busy?: boolean;
  refreshingQuote?: boolean;
  statusMessage?: string | null;
  onApprove: () => void;
  onCancel: () => void;
  onFreshQuote?: () => void;
  className?: string;
}) {
  const defiState = useDeFiApprovalState(pending);
  const isProvision = pending.action === "deepbook_provision_manager" || pending.action === "deepbook_provision_margin_manager";
  const isDeposit =
    pending.action === "deepbook_deposit" || pending.action === "deepbook_withdraw";
  const isLimitOrder = pending.action === "deepbook_place_limit_order";
  const isMarketOrder = pending.action === "deepbook_place_market_order";
  const isCancelOrder =
    pending.action === "deepbook_cancel_order" ||
    pending.action === "deepbook_cancel_orders" ||
    pending.action === "deepbook_cancel_all_orders";
  const isModifyOrder = pending.action === "deepbook_modify_order";
  const isSettledWithdraw =
    pending.action === "deepbook_withdraw_settled_amounts" ||
    pending.action === "deepbook_withdraw_settled_amounts_permissionless";
  const isFlashLoan = pending.action === "deepbook_flash_loan";
  const isStake = pending.action === "deepbook_stake";
  const isUnstake = pending.action === "deepbook_unstake";
  const isSubmitProposal = pending.action === "deepbook_submit_proposal";
  const isVote = pending.action === "deepbook_vote";
  const isMargin = pending.action.startsWith("deepbook_margin_");
  const isPredict = pending.action.startsWith("deepbook_predict_");
  const flashStrategy =
    isFlashLoan && typeof pending.params.strategy === "string"
      ? pending.params.strategy
      : null;
  const flashSteps = isFlashLoan && Array.isArray(pending.params.steps)
    ? (pending.params.steps as Array<{ pool_key?: string; side?: string; amount?: number }>)
    : [];
  const isOrder = isLimitOrder || isMarketOrder;

  const isLegacySwap =
    !defiState.preview &&
    (pending.action === "swap" ||
      pending.action === "deepbook_swap" ||
      pending.action === "stellar_swap");
  const legacyQuoteExpiresAt = isLegacySwap ? resolveQuoteExpiresAt(pending) : null;
  const legacyQuoteCountdown = useSwapQuoteCountdown(legacyQuoteExpiresAt);
  const legacyQuoteExpired = isLegacySwap && legacyQuoteCountdown.status === "expired";
  const quoteExpired = defiState.quoteExpired || legacyQuoteExpired;
  const isLifiContinuation =
    pending.params.lifi_continuation === true ||
    pending.params.approval_kind === "lifi_continue" ||
    defiState.preview?.kind === "lifi_continue";
  const approveDisabled = busy || refreshingQuote || (quoteExpired && !isLifiContinuation);
  const canRefreshQuote =
    !isLifiContinuation &&
    (defiState.preview?.kind === "bridge" ||
      defiState.preview?.kind === "swap" ||
      defiState.preview?.provider_id === "stellar-soroswap" ||
      isLegacySwap ||
      pending.action === "cross_chain_swap" ||
      pending.action === "stellar_swap");
  const showFreshQuote =
    canRefreshQuote &&
    Boolean(onFreshQuote) &&
    (quoteExpired ||
      /fresh quote|quote expired/i.test(statusMessage ?? ""));

  const title = defiState.preview
    ? defiState.title
    : isFlashLoan
      ? "Approve flash loan"
      : isStake
        ? "Approve stake"
        : isUnstake
          ? "Approve unstake"
          : isSubmitProposal
            ? "Approve proposal"
            : isVote
              ? "Approve vote"
              : isMargin
                ? "Approve margin action"
                : isPredict
                  ? "Approve prediction"
                  : isOrder
                    ? "Approve order"
                    : isCancelOrder
                      ? "Approve cancel"
                      : isModifyOrder
                        ? "Approve modify"
                        : isSettledWithdraw
                          ? "Approve claim"
                          : isProvision
                            ? "Approve setup"
                            : defiState.title;

  const subtitle = defiState.preview
    ? defiState.subtitle
    : isLegacySwap
      ? "Review the quote, then approve to execute on chain."
      : isFlashLoan
        ? flashStrategy === "swap_chain_repay"
          ? "Atomic borrow → swaps → repay in one transaction. If any step fails, everything reverts — you only pay gas."
          : "Atomic borrow and repay in one transaction. If repayment fails, the entire transaction reverts — you only pay gas."
        : isStake
          ? "Stakes DEEP from your DeepBook balance manager into the pool for fee discounts."
          : isUnstake
            ? "Returns your active stake from the pool back to your balance manager."
            : isSubmitProposal
              ? "Submits proposed taker/maker fees and stake requirement for the next epoch. Requires active stake."
              : isVote
                ? "Casts your stake-weighted vote for the named proposal on this pool."
                : isMargin
                  ? "Review the margin action details. Margin trading involves leverage and liquidation risk."
                  : isPredict
                    ? "Review the prediction market action. Positions expire and may lose value if the outcome is unfavorable."
                    : isLimitOrder
                      ? "Review price and size, then approve to place the limit order on DeepBook."
                      : isMarketOrder
                        ? "Review the order size and side, then approve to place on DeepBook."
                        : isCancelOrder
                          ? "Review the cancellation, then approve to update your open orders."
                          : isModifyOrder
                            ? "Review the new order size, then approve to modify on DeepBook. Price cannot be changed — cancel and replace to change price."
                            : isSettledWithdraw
                              ? "Review the pool, then approve to move settled proceeds into your balance manager."
                              : isProvision
                                ? "Creates your DeepBook balance manager on chain. No token deposit — only network gas."
                                : isDeposit
                                  ? "Review the amount, then approve to sign and send."
                                  : defiState.subtitle;

  const isLifi =
    pending.action === "cross_chain_swap" ||
    pending.defi_preview?.provider_id === "evm-lifi" ||
    pending.defi_preview?.provider_id === "evm-squid" ||
    defiState.preview?.kind === "bridge" ||
    defiState.preview?.kind === "lifi_continue";
  const isAlternateRoute = isAlternateCrossChainRoute(pending);
  const alternateRouteLabel =
    pending.defi_preview?.route_provider_label ?? "Alternate route";

  const displayTitle = busy
    ? isLifi
      ? "Submitting transaction"
      : "Signing & sending"
    : title;

  const displaySubtitle = busy
    ? "Signing and broadcasting on chain. This may take a moment."
    : subtitle;

  return (
    <div
      role="region"
      aria-labelledby="tx-approval-title"
      className={`rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-5 shadow-[4px_4px_0_var(--hero-ink)] ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)]/20 text-[var(--hero-amber)]">
          <ShieldAlert className="size-5" strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            id="tx-approval-title"
            className="font-heading text-lg font-extrabold tracking-tight text-[var(--hero-ink)]"
          >
            {displayTitle}
          </p>
          <p className="mt-0.5 text-xs font-medium text-[var(--hero-ink)]/50">{displaySubtitle}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border-2 border-[var(--hero-ink)] px-2.5 py-0.5 text-[10px] font-bold uppercase ${
            quoteExpired
              ? "bg-[var(--hero-coral)]/15 text-[var(--hero-coral)]"
              : busy
                ? "bg-[var(--hero-blue)]/15 text-[var(--hero-blue)]"
                : isAlternateRoute
                  ? "bg-[var(--hero-mint)]/15 text-[var(--hero-mint)]"
                : "bg-[var(--hero-amber)]/15 text-[var(--hero-amber)]"
          }`}
        >
          {busy
            ? "Executing"
            : quoteExpired && !isLifiContinuation
            ? "Quote expired"
            : isAlternateRoute
              ? alternateRouteLabel
            : isLifiContinuation
              ? "Action required"
              : "Pending"}
        </span>
      </div>

      <div className="mt-4 rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/20 bg-[var(--hero-bg)] px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
          {pending.summary}
        </p>
        <p className="mt-1 font-heading text-2xl font-extrabold tracking-tight text-[var(--hero-ink)]">
          {formatAmountDisplayText(pending.amount_display)}
        </p>
        <p className="mt-1 font-mono text-[10px] font-semibold text-[var(--hero-ink)]/45">
          {pending.chain_id} · {pending.action}
        </p>
        {defiState.preview ? (
          <DeFiApprovalPreviewCard
            pending={pending}
            preview={defiState.preview}
            quoteCountdown={defiState.quoteCountdown}
            quoteExpired={defiState.quoteExpired}
            quoteExpiresAt={defiState.quoteExpiresAt}
          />
        ) : isLegacySwap ? (
          <>
            {typeof pending.params.estimated_out_display === "number" ? (
              <p className="mt-2 text-sm font-semibold text-[var(--hero-ink)]/70">
                Estimated receive: ~
                {formatDisplayNumber(pending.params.estimated_out_display)}{" "}
                {typeof pending.params.output_coin === "string"
                  ? pending.params.output_coin
                  : pending.amount_display.split("→").pop()?.trim().split(/\s+/).pop() ?? ""}
              </p>
            ) : null}
            {pending.fiat_preview ? (
              <FiatPreviewLines fiat={pending.fiat_preview} />
            ) : null}
            {legacyQuoteCountdown.status === "active" && legacyQuoteExpiresAt ? (
              <p className="mt-2 text-[10px] font-semibold tabular-nums text-[var(--hero-blue)]">
                <QuoteExpiryCountdownLabel expiresAt={legacyQuoteExpiresAt} />
              </p>
            ) : null}
            {legacyQuoteExpired ? (
              <p className="mt-2 text-[10px] font-semibold text-[var(--hero-coral)]">
                This quote expired. Tap <span className="font-bold">Fresh quote</span> to update
                the rate, then approve.
              </p>
            ) : (
              <p className="mt-2 text-[10px] font-medium text-[var(--hero-ink)]/45">
                On approve, the swap re-quotes at current market prices with your slippage limit.
              </p>
            )}
          </>
        ) : isFlashLoan ? (
          <>
            {flashSteps.length > 0 ? (
              <ul className="mt-2 space-y-1 text-[10px] font-medium text-[var(--hero-ink)]/55">
                {flashSteps.map((step, index) => (
                  <li key={`${step.pool_key ?? "step"}-${index}`}>
                    Step {index + 1}: {step.side ?? "?"}{" "}
                    {typeof step.amount === "number"
                      ? formatDisplayNumber(step.amount)
                      : (step.amount ?? "?")}{" "}
                    @ {step.pool_key ?? "?"}
                  </li>
                ))}
                <li>
                  Repay{" "}
                  {typeof pending.params.borrow_amount === "number"
                    ? formatDisplayNumber(pending.params.borrow_amount)
                    : String(pending.params.borrow_amount ?? "?")}{" "}
                  {String(pending.params.coin_key ?? pending.params.asset ?? "loan asset")} atomically
                </li>
              </ul>
            ) : null}
            <p className="mt-2 text-[10px] font-medium text-[var(--hero-coral)]">
              Advanced: uncollateralized loan — must be repaid in the same transaction or everything reverts.
            </p>
            {typeof pending.params.estimated_surplus === "number" ? (
              <p className="mt-1 text-[10px] font-medium text-[var(--hero-ink)]/45">
                Estimated surplus: {formatDisplayNumber(pending.params.estimated_surplus)}
              </p>
            ) : null}
          </>
        ) : isLimitOrder ? (
          <p className="mt-2 text-[10px] font-medium text-[var(--hero-ink)]/45">
            Limit orders lock funds in your DeepBook balance manager until filled or cancelled.
          </p>
        ) : null}
      </div>

      {statusMessage && !busy ? (
        <p
          role="alert"
          className="mt-4 rounded-2xl border-2 border-[var(--hero-coral)]/30 bg-[var(--hero-coral)]/10 px-4 py-3 text-xs font-semibold text-[var(--hero-coral)]"
        >
          {statusMessage}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={approveDisabled}
          onClick={onApprove}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-4 py-2.5 text-sm font-bold text-[var(--hero-bg)] shadow-[3px_3px_0_var(--hero-coral)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy
            ? "Submitting…"
            : refreshingQuote
              ? "Refreshing…"
            : quoteExpired && !isLifiContinuation
            ? "Quote expired"
            : isLifiContinuation
              ? "Sign & send"
              : "Approve & send"}
        </button>
        <button
          type="button"
          disabled={busy || refreshingQuote}
          onClick={onCancel}
          className="inline-flex flex-1 items-center justify-center rounded-full border-2 border-[var(--hero-ink)] bg-white px-4 py-2.5 text-sm font-bold shadow-[3px_3px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
        {showFreshQuote ? (
          <button
            type="button"
            disabled={busy || refreshingQuote}
            onClick={onFreshQuote}
            className="inline-flex w-full items-center justify-center rounded-full border-2 border-[var(--hero-blue)] bg-[var(--hero-blue)]/10 px-4 py-2.5 text-sm font-bold text-[var(--hero-blue)] shadow-[2px_2px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto sm:w-auto"
          >
            {refreshingQuote ? <Loader2 className="size-4 animate-spin" /> : null}
            Fresh quote
          </button>
        ) : null}
      </div>
    </div>
  );
}
