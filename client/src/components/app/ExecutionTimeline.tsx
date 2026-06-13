"use client";

import { Check, Circle, Minus, X } from "lucide-react";
import type { ExecutionStep } from "@/lib/chat-execution-steps";
import { chainExplorerTxUrl } from "@/lib/chain-meta";

function StepIcon({ status }: { status: ExecutionStep["status"] }) {
  switch (status) {
    case "ok":
      return (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-[var(--hero-mint)] bg-[var(--hero-mint)]/15 text-[var(--hero-mint)]">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      );
    case "failed":
      return (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-[var(--hero-coral)] bg-[var(--hero-coral)]/15 text-[var(--hero-coral)]">
          <X className="size-3.5" strokeWidth={3} />
        </span>
      );
    case "skipped":
      return (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-[var(--hero-ink)]/25 bg-[var(--hero-ink)]/5 text-[var(--hero-ink)]/40">
          <Minus className="size-3.5" strokeWidth={3} />
        </span>
      );
    case "warning":
      return (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-[var(--hero-amber)] bg-[var(--hero-amber)]/15 text-[var(--hero-amber)]">
          <Circle className="size-2.5 fill-current" strokeWidth={0} />
        </span>
      );
  }
}

export function ExecutionTimeline({
  steps,
  onViewActivity,
}: {
  steps: ExecutionStep[];
  onViewActivity: (transactionId: string) => void;
}) {
  return (
    <div className="w-full max-w-full rounded-2xl border-2 border-[var(--hero-ink)]/15 bg-[var(--hero-bg)]/60 px-4 py-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--hero-ink)]/40">
        Execution
      </p>
      <ol className="flex flex-col gap-0">
        {steps.map((step, index) => {
          const explorerUrl =
            step.digest && step.chainId
              ? chainExplorerTxUrl(step.chainId, step.digest)
              : null;
          const isLast = index === steps.length - 1;

          return (
            <li key={`${step.label}-${index}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <StepIcon status={step.status} />
                {!isLast ? (
                  <span className="my-0.5 w-0.5 flex-1 min-h-[0.75rem] rounded-full bg-[var(--hero-ink)]/15" />
                ) : null}
              </div>
              <div className={`min-w-0 flex-1 ${isLast ? "pb-0" : "pb-3"}`}>
                <p className="text-xs font-bold text-[var(--hero-ink)]">{step.label}</p>
                {step.detail ? (
                  <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-[var(--hero-ink)]/55">
                    {step.detail}
                  </p>
                ) : null}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {explorerUrl ? (
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-bold text-[var(--hero-blue)] hover:underline"
                    >
                      Explorer
                    </a>
                  ) : null}
                  {step.agentTransactionId ? (
                    <button
                      type="button"
                      onClick={() => onViewActivity(step.agentTransactionId!)}
                      className="text-[10px] font-bold text-[var(--hero-violet)] hover:underline"
                    >
                      View activity
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
