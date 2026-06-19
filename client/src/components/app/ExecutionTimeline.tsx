"use client";

import { Check, Circle, ExternalLink, Loader2, Minus, X } from "lucide-react";
import { AgentWorkingIndicator } from "@/components/app/AgentWorkingIndicator";
import type { ExecutionStep } from "@/lib/chat-execution-steps";
import { inferStatusCategoryFromExecutionSteps } from "@/lib/agent-status-category";
import type { AgentStatusCategory } from "@/lib/agent-status-category";
import { explorerLinkLabel, explorerUrlForDigest } from "@/lib/explorer-tx-link";

function StepIcon({ status }: { status: ExecutionStep["status"] }) {
  switch (status) {
    case "pending":
      return (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-[var(--hero-ink)]/20 bg-[var(--hero-ink)]/5 text-[var(--hero-ink)]/30">
          <Circle className="size-2.5" strokeWidth={2.5} />
        </span>
      );
    case "running":
      return (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-[var(--hero-blue)] bg-[var(--hero-blue)]/10 text-[var(--hero-blue)]">
          <Loader2 className="size-3.5 animate-spin" strokeWidth={2.5} />
        </span>
      );
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
  live = false,
  statusCategory,
}: {
  steps: ExecutionStep[];
  live?: boolean;
  statusCategory?: AgentStatusCategory;
}) {
  const liveCategory =
    statusCategory ??
    (live ? inferStatusCategoryFromExecutionSteps(steps) : undefined);

  return (
    <div className="w-full max-w-full rounded-2xl border-2 border-[var(--hero-ink)]/15 bg-[var(--hero-bg)]/60 px-4 py-3">
      {live && liveCategory ? (
        <div className="mb-3 border-b border-[var(--hero-ink)]/10 pb-2">
          <AgentWorkingIndicator active size="compact" category={liveCategory} />
        </div>
      ) : (
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--hero-ink)]/40">
          Execution
        </p>
      )}
      <ol className="flex flex-col gap-0">
        {steps.map((step, index) => {
          const explorerUrl = explorerUrlForDigest(
            step.digest,
            step.chainId ?? "sui",
          );
          const isLast = index === steps.length - 1;
          const isActive = live && step.status === "running";

          return (
            <li
              key={step.id}
              className={`flex gap-3 transition-opacity duration-300 ${step.status === "pending" ? "opacity-40" : "opacity-100"}`}
            >
              <div className="flex flex-col items-center">
                <StepIcon status={step.status} />
                {!isLast ? (
                  <span
                    className={`my-0.5 w-0.5 flex-1 min-h-3 rounded-full ${
                      step.status === "ok" ? "bg-[var(--hero-mint)]/40" : "bg-[var(--hero-ink)]/15"
                    }`}
                  />
                ) : null}
              </div>
              <div className={`min-w-0 flex-1 ${isLast ? "pb-0" : "pb-3"}`}>
                <p
                  className={`text-xs font-bold ${isActive ? "text-[var(--hero-blue)]" : "text-[var(--hero-ink)]"}`}
                >
                  {step.label}
                </p>
                {step.detail ? (
                  <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-[var(--hero-ink)]/55">
                    {step.detail}
                  </p>
                ) : null}
                {explorerUrl ? (
                  <div className="mt-1">
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[var(--hero-blue)] hover:underline"
                    >
                      {explorerLinkLabel(step)}
                      <ExternalLink className="size-2.5" />
                    </a>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
