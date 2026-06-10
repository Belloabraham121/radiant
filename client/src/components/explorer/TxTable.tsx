"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Copy, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtAgo, type AgentTx } from "@/lib/explorer-data";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** One grid template for header + every row — keeps columns vertically aligned. */
const TX_GRID =
  "grid grid-cols-[6.75rem_8.5rem_6.5rem_5.25rem_4.5rem_3.5rem] items-center gap-x-3 sm:grid-cols-[minmax(6.75rem,1.1fr)_minmax(8.5rem,1.3fr)_minmax(6.5rem,1fr)_minmax(5.25rem,0.8fr)_minmax(4.5rem,0.75fr)_minmax(3.5rem,0.6fr)]";

function fmtTimestamp(minutesAgo: number): string {
  const d = new Date(Date.now() - minutesAgo * 60_000);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: AgentTx["status"] }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
        status === "success"
          ? "bg-[var(--hero-mint)]/15 text-[var(--hero-mint)]"
          : "bg-[var(--hero-amber)]/20 text-[#b97700]"
      }`}
    >
      {status}
    </span>
  );
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      className={`rounded-lg border-2 border-[var(--hero-ink)] p-1.5 transition-all hover:-translate-y-0.5 ${
        copied ? "bg-[var(--hero-mint)] text-white" : ""
      }`}
    >
      <Copy className="size-3.5" strokeWidth={2.5} />
    </button>
  );
}

function DetailRow({
  label,
  value,
  mono,
  copyValue,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyValue?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-[var(--hero-ink)]/15 px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/40">
        {label}
      </p>
      <div className="mt-1 flex items-start justify-between gap-2">
        <p
          className={`min-w-0 break-all text-sm font-semibold ${mono ? "font-mono" : ""}`}
          style={accent ? { color: accent } : undefined}
        >
          {value}
        </p>
        {copyValue && <CopyBtn text={copyValue} label={label} />}
      </div>
    </div>
  );
}

function TxDetailDialog({
  tx,
  accent,
  open,
  onOpenChange,
}: {
  tx: AgentTx | null;
  accent: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!tx) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="max-h-[90vh] overflow-y-auto rounded-3xl border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] p-0 shadow-[8px_8px_0_var(--hero-ink)] ring-0 sm:max-w-lg"
      >
        <DialogHeader className="border-b-2 border-[var(--hero-ink)] px-6 py-5">
          <div className="flex items-center justify-between gap-3 pr-8">
            <DialogTitle className="font-heading text-xl font-extrabold tracking-tight">
              Transaction
            </DialogTitle>
            <StatusBadge status={tx.status} />
          </div>
          <p className="text-xs font-medium text-[var(--hero-ink)]/50">
            {fmtTimestamp(tx.minutesAgo)} · {fmtAgo(tx.minutesAgo)}
          </p>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-6 py-5">
          <DetailRow label="Hash" value={tx.fullHash} mono copyValue={tx.fullHash} accent={accent} />
          <DetailRow label="Action" value={tx.action} />
          <DetailRow label="From" value={tx.fullFrom} mono copyValue={tx.fullFrom} />
          <DetailRow label="To" value={tx.fullTo} mono copyValue={tx.fullTo} />
          <div className="grid grid-cols-2 gap-3">
            <DetailRow
              label="Amount"
              value={`${tx.amountSui.toLocaleString("en-US")} SUI`}
            />
            <DetailRow label="Gas fee" value={`${tx.gasSui} SUI`} />
          </div>
          <DetailRow label="Block" value={tx.block.toLocaleString("en-US")} mono />
        </div>

        <div className="border-t-2 border-[var(--hero-ink)] px-6 py-4">
          <a
            href="#"
            className="group flex items-center justify-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-white py-3 text-sm font-bold shadow-[3px_3px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5"
            style={{ boxShadow: `3px 3px 0 ${accent}` }}
          >
            View on Sui Explorer
            <ExternalLink className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TxRow({
  tx,
  accent,
  onSelect,
}: {
  tx: AgentTx;
  accent: string;
  onSelect: (tx: AgentTx) => void;
}) {
  return (
    <button
      type="button"
      data-tx-row
      onClick={() => onSelect(tx)}
      className={`${TX_GRID} w-full min-w-[640px] border-b border-[var(--hero-ink)]/10 px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-[var(--hero-bg)] sm:px-6`}
    >
      <span
        className="truncate text-center font-mono text-xs font-semibold underline decoration-dotted underline-offset-2"
        style={{ color: accent }}
      >
        {tx.hash}
      </span>
      <span className="truncate text-center text-sm font-bold">{tx.action}</span>
      <span className="truncate text-center font-mono text-xs text-[var(--hero-ink)]/45">
        {tx.from}
      </span>
      <span className="truncate text-center text-sm font-bold tabular-nums">
        {tx.amountSui.toLocaleString("en-US")} SUI
      </span>
      <span className="flex justify-center">
        <StatusBadge status={tx.status} />
      </span>
      <span className="truncate text-center text-xs font-semibold tabular-nums text-[var(--hero-ink)]/40">
        {fmtAgo(tx.minutesAgo)}
      </span>
    </button>
  );
}

export function TxTable({ txs, accent }: { txs: AgentTx[]; accent: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<AgentTx | null>(null);
  const [open, setOpen] = useState(false);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from("[data-tx-row]", {
        x: -28,
        opacity: 0,
        duration: 0.5,
        stagger: 0.07,
        ease: "power3.out",
        scrollTrigger: { trigger: ref.current, start: "top 85%" },
      });
    },
    { scope: ref },
  );

  const openTx = (tx: AgentTx) => {
    setSelected(tx);
    setOpen(true);
  };

  return (
    <>
      <div
        ref={ref}
        className="overflow-hidden rounded-3xl border-2 border-[var(--hero-ink)] bg-white shadow-[6px_6px_0_var(--hero-ink)]"
      >
        <div className="flex items-center justify-between border-b-2 border-[var(--hero-ink)] px-4 py-4 sm:px-6">
          <h3 className="font-heading text-lg font-extrabold tracking-tight">Recent transactions</h3>
          <span
            className="hero-blink flex items-center gap-1.5 text-xs font-bold"
            style={{ color: accent }}
          >
            <span className="size-2 rounded-full bg-current" />
            <span className="size-2 rounded-full bg-current" />
            <span className="size-2 rounded-full bg-current" />
            live
          </span>
        </div>

        <div className="overflow-x-auto">
          <div className="mx-auto min-w-[640px] max-w-full">
            <div
              className={`${TX_GRID} border-b border-[var(--hero-ink)]/10 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/35 sm:px-6`}
            >
              <span className="text-center">Hash</span>
              <span className="text-center">Action</span>
              <span className="text-center">From</span>
              <span className="text-center">Amount</span>
              <span className="text-center">Status</span>
              <span className="text-center">Time</span>
            </div>

            {txs.map((tx) => (
              <TxRow key={tx.fullHash} tx={tx} accent={accent} onSelect={openTx} />
            ))}
          </div>
        </div>
      </div>

      <TxDetailDialog
        tx={selected}
        accent={accent}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
