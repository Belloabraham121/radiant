"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, MessageSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAgentTransactionDetail } from "@/hooks/useAgentTransactions";
import { formatAmountDisplayText } from "@/lib/format-display-amount";
import {
  formatTransactionStatus,
  transactionStatusChipClass,
} from "@/lib/agent-transactions-api";
import {
  explorerLinkLabelForActivityCategory,
  resolveActivityExplorerUrl,
} from "@/lib/explorer-tx-link";

type AgentTransactionDetailDialogProps = {
  transactionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function readFlashLoanQuoteFromResult(result: Record<string, unknown> | null): {
  steps: Array<{
    side: string;
    in_amount: number;
    out_est: number;
    min_out: number;
    input_coin: string;
    output_coin: string;
    pool_key: string;
  }>;
  repay_amount: number;
  repay_asset: string;
  borrow_amount: number;
  coin_key: string;
  estimated_surplus: number | null;
} | null {
  if (!result || typeof result !== "object") {
    return null;
  }
  const quote = result.flash_loan_quote;
  if (!quote || typeof quote !== "object") {
    return null;
  }
  const q = quote as {
    steps?: Array<{
      side: string;
      in_amount: number;
      out_est: number;
      min_out: number;
      input_coin: string;
      output_coin: string;
      pool_key: string;
    }>;
    repay_amount?: number;
    repay_asset?: string;
    borrow_amount?: number;
    coin_key?: string;
    estimated_surplus?: number | null;
  };
  if (!Array.isArray(q.steps) || q.steps.length === 0) {
    return null;
  }
  return {
    steps: q.steps,
    repay_amount: q.repay_amount ?? 0,
    repay_asset: q.repay_asset ?? "",
    borrow_amount: q.borrow_amount ?? 0,
    coin_key: q.coin_key ?? "",
    estimated_surplus: q.estimated_surplus ?? null,
  };
}

function FlashLoanQuoteBreakdown({
  quote,
}: {
  quote: NonNullable<ReturnType<typeof readFlashLoanQuoteFromResult>>;
}) {
  const lastStep = quote.steps[quote.steps.length - 1];
  return (
    <div className="rounded-2xl border-2 border-[var(--hero-ink)]/15 bg-white px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--hero-ink)]/45">
        Flash loan route
      </p>
      <ol className="mt-3 space-y-2">
        <li className="text-sm font-medium text-[var(--hero-ink)]/70">
          Borrow {quote.borrow_amount} {quote.coin_key}
        </li>
        {quote.steps.map((step, index) => (
          <li
            key={`${step.pool_key}-${index}`}
            className="text-sm font-medium text-[var(--hero-ink)]/70"
          >
            Swap {index + 1}: {step.side} {step.in_amount} {step.input_coin} → ~
            {step.out_est} {step.output_coin} on {step.pool_key} (min out ~
            {step.min_out})
          </li>
        ))}
        <li className="text-sm font-medium text-[var(--hero-ink)]/70">
          Repay {quote.repay_amount} {quote.repay_asset}
          {quote.estimated_surplus != null && quote.estimated_surplus < 0
            ? ` — shortfall ~${Math.abs(quote.estimated_surplus)} ${quote.coin_key}`
            : lastStep
              ? ` — last min out ~${lastStep.min_out} ${lastStep.output_coin}`
              : ""}
        </li>
      </ol>
    </div>
  );
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function JsonDetailsBlock({
  label,
  value,
}: {
  label: string;
  value: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border-2 border-dashed border-(--hero-ink)/20 bg-white px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="w-full cursor-pointer text-left text-xs font-bold uppercase tracking-widest text-(--hero-ink)/45"
      >
        {label}
      </button>
      {open ? (
        <pre className="mt-2 max-h-40 max-w-full overflow-auto overscroll-x-contain whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-(--hero-ink)/70">
          {JSON.stringify(value, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

export function AgentTransactionDetailDialog({
  transactionId,
  open,
  onOpenChange,
}: AgentTransactionDetailDialogProps) {
  const { detail, loading, error } = useAgentTransactionDetail(
    transactionId,
    open,
  );

  const explorerUrl = detail ? resolveActivityExplorerUrl(detail) : null;
  const flashLoanQuote = detail
    ? readFlashLoanQuoteFromResult(detail.result)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-full max-w-[calc(100%-2rem)] overflow-x-hidden overflow-y-auto border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] p-0 shadow-[6px_6px_0_var(--hero-ink)] sm:max-w-lg">
        <DialogHeader className="border-b-2 border-[var(--hero-ink)]/10 px-6 py-5">
          <DialogTitle className="font-heading text-xl font-extrabold tracking-tight text-[var(--hero-ink)]">
            Agent transaction
          </DialogTitle>
        </DialogHeader>

        <div className="min-w-0 space-y-4 overflow-hidden px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm font-semibold text-[var(--hero-ink)]/45">
              <Loader2 className="size-5 animate-spin" />
              Loading…
            </div>
          ) : error ? (
            <p className="text-sm font-semibold text-[var(--hero-coral)]">
              {error}
            </p>
          ) : detail ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-heading text-lg font-extrabold tracking-tight">
                    {detail.title}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--hero-ink)]/55">
                    {formatAmountDisplayText(detail.amount_display)}
                  </p>
                </div>
                <span
                  className={`rounded-full border-2 px-2.5 py-0.5 text-[10px] font-bold uppercase ${transactionStatusChipClass(detail.status)}`}
                >
                  {formatTransactionStatus(detail.status, detail.error_code)}
                </span>
              </div>

              {flashLoanQuote ? (
                <FlashLoanQuoteBreakdown quote={flashLoanQuote} />
              ) : null}

              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="font-bold uppercase tracking-[0.1em] text-[var(--hero-ink)]/40">
                    Chain
                  </dt>
                  <dd className="mt-0.5 font-semibold capitalize">
                    {detail.chain_id}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-[0.1em] text-[var(--hero-ink)]/40">
                    Category
                  </dt>
                  <dd className="mt-0.5 font-semibold">
                    {detail.category.replace(/_/g, " ")}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-[0.1em] text-[var(--hero-ink)]/40">
                    Created
                  </dt>
                  <dd className="mt-0.5 font-semibold">
                    {formatTimestamp(detail.created_at)}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-[0.1em] text-[var(--hero-ink)]/40">
                    Completed
                  </dt>
                  <dd className="mt-0.5 font-semibold">
                    {formatTimestamp(detail.completed_at)}
                  </dd>
                </div>
              </dl>

              {detail.error_message ? (
                <div className="min-w-0 overflow-hidden rounded-2xl border-2 border-[var(--hero-coral)]/30 bg-[var(--hero-coral)]/10 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--hero-coral)]">
                    Error
                  </p>
                  <p className="mt-1 break-words text-sm font-medium text-[var(--hero-ink)]/70">
                    {detail.error_message}
                  </p>
                </div>
              ) : null}

              <JsonDetailsBlock label="Parameters" value={detail.params} />

              {detail.result ? (
                <JsonDetailsBlock label="Result" value={detail.result} />
              ) : null}

              <div className="flex flex-wrap gap-2 pt-1">
                {detail.session_id ? (
                  <Link
                    href={`/app/chat/${detail.session_id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-ink)] px-4 py-2 text-xs font-bold text-[var(--hero-bg)] shadow-[3px_3px_0_var(--hero-coral)]"
                    onClick={() => onOpenChange(false)}
                  >
                    <MessageSquare className="size-3.5" />
                    Open chat
                  </Link>
                ) : null}
                {explorerUrl ? (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-(--hero-ink) bg-white px-4 py-2 text-xs font-bold text-[var(--hero-ink)]"
                  >
                    {explorerLinkLabelForActivityCategory(detail.category, {
                      chainId: detail.chain_id,
                      evmChainId:
                        typeof detail.result?.evm_chain_id === "number"
                          ? detail.result.evm_chain_id
                          : undefined,
                    })}
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
