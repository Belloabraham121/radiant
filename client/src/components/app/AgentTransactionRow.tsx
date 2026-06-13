"use client";

import Link from "next/link";
import { ExternalLink, MessageSquare } from "lucide-react";
import { formatAmountDisplayText } from "@/lib/format-display-amount";
import type { AgentTransactionListItem } from "@/lib/agent-transactions-api";
import {
  formatTransactionStatus,
  transactionStatusChipClass,
} from "@/lib/agent-transactions-api";
import { chainExplorerTxUrl } from "@/lib/chain-meta";
import { formatSessionTime } from "@/lib/chat-messages";

type AgentTransactionRowProps = {
  item: AgentTransactionListItem;
  onSelect?: (id: string) => void;
};

export function AgentTransactionRow({ item, onSelect }: AgentTransactionRowProps) {
  const explorerUrl = item.digest ? chainExplorerTxUrl(item.chain_id, item.digest) : null;
  const when = formatSessionTime(item.completed_at ?? item.created_at);
  const timeLabel = when === "now" ? "just now" : `${when} ago`;

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-heading text-sm font-extrabold tracking-tight">{item.title}</p>
          <p className="mt-0.5 truncate text-xs font-medium text-[var(--hero-ink)]/55">
            {formatAmountDisplayText(item.amount_display)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border-2 px-2 py-0.5 text-[10px] font-bold uppercase ${transactionStatusChipClass(item.status)}`}
        >
          {formatTransactionStatus(item.status)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
          {timeLabel}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
          {item.category.replace(/_/g, " ")}
        </span>
        {explorerUrl ? (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--hero-blue)] hover:underline"
          >
            Explorer
            <ExternalLink className="size-3" />
          </a>
        ) : null}
        {item.session_id ? (
          <Link
            href={`/app/chat/${item.session_id}`}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--hero-violet)] hover:underline"
          >
            Open chat
            <MessageSquare className="size-3" />
          </Link>
        ) : null}
      </div>
    </>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        className="w-full rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-4 text-left shadow-[4px_4px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5"
      >
        {inner}
      </button>
    );
  }

  return (
    <div className="rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-4 shadow-[4px_4px_0_var(--hero-ink)]">
      {inner}
    </div>
  );
}
