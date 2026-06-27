"use client";

import type { PendingTransaction } from "@/lib/chat-api";
import type { DeFiApprovalPreview } from "@/lib/defi-approval-preview";
import type { QuoteCountdownState } from "@/hooks/useSwapQuoteCountdown";
import {
  resolveQuoteExpiresAt,
  useSwapQuoteCountdown,
} from "@/hooks/useSwapQuoteCountdown";
import { formatDisplayNumber } from "@/lib/format-display-amount";
import { FiatPreviewLines } from "@/components/app/defi/FiatPreviewLines";

function formatUsd(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return `~$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function resolveDeFiPreview(pending: PendingTransaction): DeFiApprovalPreview | null {
  return pending.defi_preview ?? null;
}

function approvalTitle(preview: DeFiApprovalPreview): string {
  switch (preview.kind) {
    case "swap":
      return "Approve swap";
    case "bridge":
      return "Approve bridge";
    case "lifi_continue":
      return preview.title.startsWith("Sign") ? preview.title : "Sign destination transaction";
    case "transfer":
      return "Approve transfer";
    default:
      return preview.title.startsWith("Approve") ? preview.title : "Approve transaction";
  }
}

function approvalSubtitle(preview: DeFiApprovalPreview): string {
  switch (preview.kind) {
    case "swap":
      return "Review the quote, then approve to execute on chain.";
    case "bridge":
      return "Review the bridge route and quote, then approve to start the cross-chain transfer.";
    case "lifi_continue":
      return "Your bridge is in progress — approve to sign the destination-chain transaction and finish.";
    default:
      return "Review the details, then approve to sign and send.";
  }
}

function quoteRefreshHint(preview: DeFiApprovalPreview): string {
  if (preview.kind === "bridge") {
    return "On approve, the bridge re-validates the route at current market prices.";
  }
  return "On approve, the swap re-quotes at current market prices with your slippage limit.";
}

export function DeFiApprovalPreviewCard({
  pending,
  preview,
  quoteCountdown,
  quoteExpired,
}: {
  pending: PendingTransaction;
  preview: DeFiApprovalPreview;
  quoteCountdown: QuoteCountdownState;
  quoteExpired: boolean;
}) {
  const fiat = preview.fiat_preview ?? pending.fiat_preview ?? null;
  const showQuoteUi =
    preview.kind === "swap" || preview.kind === "bridge";
  const showContinuationHint = preview.kind === "lifi_continue";

  return (
    <>
      {preview.pay ? (
        <p className="mt-2 text-sm font-semibold text-[var(--hero-ink)]/70">
          Pay: {preview.pay.amount_display} {preview.pay.symbol}
          {preview.pay.chain_label ? ` on ${preview.pay.chain_label}` : ""}
        </p>
      ) : null}
      {preview.receive ? (
        <p className="mt-1 text-sm font-semibold text-[var(--hero-ink)]/70">
          Receive: ~{preview.receive.amount_display} {preview.receive.symbol}
          {preview.receive.chain_label ? ` on ${preview.receive.chain_label}` : ""}
        </p>
      ) : null}
      {preview.route_summary ? (
        <p className="mt-2 text-xs font-medium text-[var(--hero-ink)]/55">
          Route: {preview.route_summary}
        </p>
      ) : null}
      {preview.bridges && preview.bridges.length > 0 ? (
        <p className="mt-1 text-[10px] font-medium text-[var(--hero-ink)]/45">
          Bridges: {preview.bridges.join(" → ")}
        </p>
      ) : null}
      {preview.fee_cost_usd != null ? (
        <p className="mt-1 text-[10px] font-medium text-[var(--hero-ink)]/45">
          Est. fees: {formatUsd(preview.fee_cost_usd)}
        </p>
      ) : null}
      {preview.slippage != null ? (
        <p className="mt-1 text-[10px] font-medium text-[var(--hero-ink)]/45">
          Slippage: {formatDisplayNumber(preview.slippage * 100, { maxFractionDigits: 2 })}%
        </p>
      ) : null}
      {fiat ? <FiatPreviewLines fiat={fiat} /> : null}
      {showQuoteUi && quoteCountdown.status === "active" ? (
        <p className="mt-2 text-[10px] font-semibold tabular-nums text-[var(--hero-blue)]">
          Quote valid for {quoteCountdown.label}
        </p>
      ) : null}
      {showQuoteUi && quoteExpired ? (
        <p className="mt-2 text-[10px] font-semibold text-[var(--hero-coral)]">
          This quote expired. Tap <span className="font-bold">Fresh quote</span> to update the
          rate, then approve.
        </p>
      ) : showContinuationHint ? (
        <p className="mt-2 text-[10px] font-medium text-[var(--hero-ink)]/45">
          This step completes an in-flight route — no new quote countdown applies.
        </p>
      ) : showQuoteUi ? (
        <p className="mt-2 text-[10px] font-medium text-[var(--hero-ink)]/45">
          {quoteRefreshHint(preview)}
        </p>
      ) : null}
    </>
  );
}

export function useDeFiApprovalState(pending: PendingTransaction): {
  preview: DeFiApprovalPreview | null;
  title: string;
  subtitle: string;
  quoteCountdown: QuoteCountdownState;
  quoteExpired: boolean;
} {
  const preview = resolveDeFiPreview(pending);
  const isBridge =
    pending.action === "cross_chain_swap" || pending.action === "lifi_approve";
  const isLifiContinuation =
    pending.params.lifi_continuation === true ||
    pending.params.approval_kind === "lifi_continue" ||
    preview?.kind === "lifi_continue";
  const isLegacySwap = pending.action === "swap" || pending.action === "deepbook_swap";
  const quoteDriven =
    !isLifiContinuation &&
    (preview?.kind === "swap" ||
      preview?.kind === "bridge" ||
      isLegacySwap ||
      isBridge);

  const quoteExpiresAt = preview?.quote_expires_at ?? resolveQuoteExpiresAt(pending);
  const quoteCountdown = useSwapQuoteCountdown(quoteDriven ? quoteExpiresAt : null);
  const quoteExpired = quoteDriven && quoteCountdown.status === "expired";

  let title = "Approve transaction";
  let subtitle = "Review the details, then approve to sign and send.";

  if (preview) {
    title = approvalTitle(preview);
    subtitle = approvalSubtitle(preview);
  } else if (isLifiContinuation) {
    title = "Sign destination transaction";
    subtitle =
      "Your bridge is in progress — approve to sign the destination-chain transaction and finish.";
  } else if (isBridge) {
    title = pending.action === "lifi_approve" ? "Approve token allowance" : "Approve bridge";
    subtitle =
      "Review the bridge route and quote, then approve to start the cross-chain transfer.";
  } else if (isLegacySwap) {
    title = "Approve swap";
    subtitle = "Review the quote, then approve to execute on chain.";
  }

  return {
    preview,
    title,
    subtitle,
    quoteCountdown,
    quoteExpired,
  };
}
