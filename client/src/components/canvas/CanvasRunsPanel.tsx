"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Lightbulb,
  Loader2,
  MinusCircle,
  RotateCcw,
  XCircle,
} from "lucide-react";
import {
  SAMPLE_RUNS,
  type RunNodeStatus,
  type RunStatus,
  type WorkflowRun,
} from "./sample-runs";

function RunStatusIcon({ status }: { status: RunStatus | RunNodeStatus }) {
  if (status === "done" || status === "ok") {
    return <CheckCircle2 className="size-4 text-[var(--hero-mint)]" strokeWidth={2.5} />;
  }
  if (status === "failed") {
    return <XCircle className="size-4 text-[var(--hero-coral)]" strokeWidth={2.5} />;
  }
  if (status === "running") {
    return <Loader2 className="size-4 animate-spin text-[var(--hero-blue)]" strokeWidth={2.5} />;
  }
  return <MinusCircle className="size-4 text-[var(--hero-ink)]/30" strokeWidth={2.5} />;
}

function durationLabel(d: number | "auto" | undefined): string {
  if (d === undefined) return "—";
  if (d === "auto") return "auto";
  return `${d}ms`;
}

function RunListItem({
  run,
  selected,
  onSelect,
}: {
  run: WorkflowRun;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border-2 px-3 py-2.5 text-left transition-all ${
        selected
          ? "border-[var(--hero-ink)] bg-[var(--hero-bg)] shadow-[3px_3px_0_var(--hero-ink)]"
          : "border-transparent hover:border-[var(--hero-ink)] hover:bg-[var(--hero-bg)]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <RunStatusIcon status={run.status} />
          <span className="font-mono text-xs font-bold">{run.time}</span>
        </span>
        <span className="text-[11px] font-bold text-[var(--hero-ink)]/40">
          {run.durationLabel}
        </span>
      </div>
      <p className="mt-1 truncate text-xs font-medium text-[var(--hero-ink)]/55">
        {run.trigger}
      </p>
    </button>
  );
}

function TraceRow({ node }: { node: WorkflowRun["trace"][number] }) {
  const failed = node.status === "failed";
  return (
    <div
      className={`rounded-xl border-2 px-3 py-2 ${
        failed
          ? "border-[var(--hero-coral)] bg-[var(--hero-coral)]/5"
          : "border-[var(--hero-ink)]/10 bg-white"
      }`}
    >
      <div className="flex items-center gap-2">
        <RunStatusIcon status={node.status} />
        <span className="flex-1 truncate text-sm font-bold">{node.node}</span>
        <span className="font-mono text-[11px] font-semibold text-[var(--hero-ink)]/40">
          {durationLabel(node.duration)}
        </span>
      </div>
      {node.detail ? (
        <p className="mt-1 pl-6 font-mono text-[11px] text-[var(--hero-ink)]/55">
          {node.detail}
          {node.tx ? (
            <a
              href="#"
              className="ml-1.5 inline-flex items-center gap-0.5 font-bold text-[var(--hero-blue)] hover:underline"
            >
              {node.tx}
              <ExternalLink className="size-3" />
            </a>
          ) : null}
        </p>
      ) : null}

      {failed && node.error ? (
        <div className="mt-2 ml-6 space-y-2">
          <div className="flex items-start gap-1.5 rounded-lg border-2 border-[var(--hero-coral)]/40 bg-[var(--hero-coral)]/10 px-2.5 py-1.5">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--hero-coral)]" strokeWidth={2.5} />
            <p className="text-[11px] font-semibold text-[var(--hero-ink)]/80">{node.error}</p>
          </div>
          {node.hint ? (
            <div className="flex items-start gap-1.5 rounded-lg border-2 border-[var(--hero-amber)]/40 bg-[var(--hero-amber)]/10 px-2.5 py-1.5">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-[var(--hero-amber)]" strokeWidth={2.5} />
              <p className="text-[11px] font-medium text-[var(--hero-ink)]/75">
                <span className="font-bold uppercase tracking-wide text-[var(--hero-ink)]/50">
                  What to do ·{" "}
                </span>
                {node.hint}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RunDetail({ run }: { run: WorkflowRun }) {
  const failedNode = run.trace.find((n) => n.status === "failed");
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Run header */}
      <div className="border-b-2 border-[var(--hero-ink)]/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <RunStatusIcon status={run.status} />
          <span className="font-heading text-base font-extrabold">Run {run.time}</span>
          <span
            className={`rounded-full border-2 border-[var(--hero-ink)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              run.mode === "live"
                ? "bg-[var(--hero-mint)]/20"
                : "bg-[var(--hero-amber)]/20"
            }`}
          >
            {run.mode}
          </span>
          <span className="ml-auto font-mono text-xs font-semibold text-[var(--hero-ink)]/45">
            {run.durationLabel}
            {run.feeLabel ? ` · ${run.feeLabel} fee` : ""}
          </span>
        </div>
        <p className="mt-1 text-xs font-medium text-[var(--hero-ink)]/55">
          trigger: {run.trigger}
        </p>

        {failedNode ? (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg border-2 border-[var(--hero-coral)] bg-[var(--hero-coral)]/10 px-2.5 py-1.5">
            <XCircle className="size-4 shrink-0 text-[var(--hero-coral)]" strokeWidth={2.5} />
            <span className="text-xs font-bold text-[var(--hero-ink)]">
              Failed at {failedNode.node}
            </span>
          </div>
        ) : null}
      </div>

      {/* Per-node trace */}
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-4">
        {run.trace.map((node, i) => (
          <TraceRow key={`${node.node}-${i}`} node={node} />
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t-2 border-[var(--hero-ink)]/10 px-4 py-3">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-white px-3 py-1.5 text-xs font-bold shadow-[2px_2px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5"
        >
          <RotateCcw className="size-3.5" strokeWidth={2.5} />
          Replay
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-white px-3 py-1.5 text-xs font-bold shadow-[2px_2px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5"
        >
          Export JSON
        </button>
      </div>
    </div>
  );
}

export function CanvasRunsPanel() {
  // Default to the failed run so debugging is front and center.
  const [selectedId, setSelectedId] = useState(
    () => SAMPLE_RUNS.find((r) => r.status === "failed")?.id ?? SAMPLE_RUNS[0]?.id,
  );
  const selected = SAMPLE_RUNS.find((r) => r.id === selectedId) ?? SAMPLE_RUNS[0];

  return (
    <div className="flex h-full min-h-0">
      {/* Runs list */}
      <aside className="flex w-72 shrink-0 flex-col border-r-2 border-[var(--hero-ink)]">
        <div className="flex items-center justify-between border-b-2 border-[var(--hero-ink)]/10 px-4 py-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--hero-ink)]/40">
            Runs
          </span>
          <span className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-coral)]/15 px-2 py-0.5 text-[10px] font-bold">
            1 failed
          </span>
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
          {SAMPLE_RUNS.map((run) => (
            <RunListItem
              key={run.id}
              run={run}
              selected={run.id === selected?.id}
              onSelect={() => setSelectedId(run.id)}
            />
          ))}
        </div>
      </aside>

      {/* Selected run debug trace */}
      <div className="min-w-0 flex-1 bg-white">
        {selected ? <RunDetail run={selected} /> : null}
      </div>
    </div>
  );
}
