"use client";

import Link from "next/link";
import { ExternalLink, Loader2, MessageSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAgentTransactionDetail } from "@/hooks/useAgentTransactions";
import {
  formatTransactionStatus,
  transactionStatusChipClass,
} from "@/lib/agent-transactions-api";
import { chainExplorerTxUrl } from "@/lib/chain-meta";

type AgentTransactionDetailDialogProps = {
  transactionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function AgentTransactionDetailDialog({
  transactionId,
  open,
  onOpenChange,
}: AgentTransactionDetailDialogProps) {
  const { detail, loading, error } = useAgentTransactionDetail(transactionId, open);

  const explorerUrl =
    detail?.explorer_url ??
    (detail?.digest ? chainExplorerTxUrl(detail.chain_id, detail.digest) : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] p-0 shadow-[6px_6px_0_var(--hero-ink)] sm:max-w-lg">
        <DialogHeader className="border-b-2 border-[var(--hero-ink)]/10 px-6 py-5">
          <DialogTitle className="font-heading text-xl font-extrabold tracking-tight text-[var(--hero-ink)]">
            Agent transaction
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm font-semibold text-[var(--hero-ink)]/45">
              <Loader2 className="size-5 animate-spin" />
              Loading…
            </div>
          ) : error ? (
            <p className="text-sm font-semibold text-[var(--hero-coral)]">{error}</p>
          ) : detail ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-heading text-lg font-extrabold tracking-tight">{detail.title}</p>
                  <p className="mt-1 text-sm font-medium text-[var(--hero-ink)]/55">
                    {detail.amount_display}
                  </p>
                </div>
                <span
                  className={`rounded-full border-2 px-2.5 py-0.5 text-[10px] font-bold uppercase ${transactionStatusChipClass(detail.status)}`}
                >
                  {formatTransactionStatus(detail.status)}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="font-bold uppercase tracking-[0.1em] text-[var(--hero-ink)]/40">
                    Chain
                  </dt>
                  <dd className="mt-0.5 font-semibold capitalize">{detail.chain_id}</dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-[0.1em] text-[var(--hero-ink)]/40">
                    Category
                  </dt>
                  <dd className="mt-0.5 font-semibold">{detail.category.replace(/_/g, " ")}</dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-[0.1em] text-[var(--hero-ink)]/40">
                    Created
                  </dt>
                  <dd className="mt-0.5 font-semibold">{formatTimestamp(detail.created_at)}</dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-[0.1em] text-[var(--hero-ink)]/40">
                    Completed
                  </dt>
                  <dd className="mt-0.5 font-semibold">{formatTimestamp(detail.completed_at)}</dd>
                </div>
              </dl>

              {detail.error_message ? (
                <div className="rounded-2xl border-2 border-[var(--hero-coral)]/30 bg-[var(--hero-coral)]/10 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--hero-coral)]">
                    Error
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--hero-ink)]/70">
                    {detail.error_message}
                  </p>
                </div>
              ) : null}

              <details className="rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/20 bg-white px-4 py-3">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-[var(--hero-ink)]/45">
                  Parameters
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto font-mono text-[11px] text-[var(--hero-ink)]/70">
                  {JSON.stringify(detail.params, null, 2)}
                </pre>
              </details>

              {detail.result ? (
                <details className="rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/20 bg-white px-4 py-3">
                  <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.1em] text-[var(--hero-ink)]/45">
                    Result
                  </summary>
                  <pre className="mt-2 max-h-40 overflow-auto font-mono text-[11px] text-[var(--hero-ink)]/70">
                    {JSON.stringify(detail.result, null, 2)}
                  </pre>
                </details>
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
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-white px-4 py-2 text-xs font-bold text-[var(--hero-ink)]"
                  >
                    View on explorer
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
