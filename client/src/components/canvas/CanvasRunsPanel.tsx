"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ExecutionTimeline } from "@/components/app/ExecutionTimeline";
import type { ExecutionStep } from "@/lib/chat-execution-steps";
import {
  getCanvasWorkflowRun,
  listCanvasWorkflowRuns,
  type CanvasWorkflowRunDetail,
  type CanvasWorkflowRunListItem,
} from "@/lib/canvas-api";
import { findCatalogEntry } from "@/lib/canvas-graph-mapper";

function formatRunTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function runDurationLabel(run: CanvasWorkflowRunListItem): string {
  if (!run.finished_at) return "…";
  const ms = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function eventsToTrace(run: CanvasWorkflowRunDetail): ExecutionStep[] {
  const steps: ExecutionStep[] = [];
  for (const evt of run.events) {
    if (evt.event_type === "workflow.run.node.complete") {
      const p = evt.payload as {
        node_id?: string;
        node_type?: string;
        status?: string;
        detail?: string;
        simulated?: boolean;
      };
      const entry = p.node_type ? findCatalogEntry(p.node_type) : undefined;
      steps.push({
        id: `node-${p.node_id ?? evt.id}`,
        label: entry?.title ?? p.node_type?.replace(/_/g, " ") ?? "Node",
        detail: p.detail,
        status:
          p.status === "failed"
            ? "failed"
            : p.status === "skipped"
              ? "skipped"
              : p.simulated
                ? "warning"
                : "ok",
      });
    }
    if (evt.event_type === "workflow.run.policy.warning") {
      const p = evt.payload as { warnings?: Array<{ message: string }> };
      const msg = p.warnings?.[0]?.message;
      if (msg) {
        steps.push({
          id: `policy-${evt.id}`,
          label: "Policy warning",
          detail: msg,
          status: "warning",
        });
      }
    }
    if (evt.event_type === "workflow.run.complete") {
      const p = evt.payload as { summary?: string; status?: string };
      steps.push({
        id: `complete-${run.id}`,
        label: p.status === "completed" ? "Dry run complete" : "Dry run failed",
        detail: p.summary,
        status: p.status === "completed" ? "ok" : "failed",
      });
    }
  }
  return steps;
}

function RunListItem({
  run,
  selected,
  onSelect,
}: {
  run: CanvasWorkflowRunListItem;
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
        <span className="font-mono text-xs font-bold">{formatRunTime(run.started_at)}</span>
        <span className="text-[11px] font-bold text-[var(--hero-ink)]/40">{runDurationLabel(run)}</span>
      </div>
      <p className="mt-1 truncate text-xs font-medium text-[var(--hero-ink)]/55">
        {run.mode} · {run.status}
      </p>
    </button>
  );
}

export function CanvasRunsPanel({ workflowId }: { workflowId: string }) {
  const [runs, setRuns] = useState<CanvasWorkflowRunListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CanvasWorkflowRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRuns() {
      setLoading(true);
      try {
        const data = await listCanvasWorkflowRuns(workflowId);
        if (cancelled) return;
        setRuns(data.runs);
        if (data.runs.length > 0) {
          setSelectedId((prev) => prev ?? data.runs[0]!.id);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRuns();
    return () => {
      cancelled = true;
    };
  }, [workflowId]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    let cancelled = false;

    async function loadDetail() {
      setDetailLoading(true);
      try {
        const data = await getCanvasWorkflowRun(workflowId, selectedId!);
        if (!cancelled) setDetail(data);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [workflowId, selectedId]);

  const failedCount = runs.filter((r) => r.status === "failed").length;
  const trace = detail ? eventsToTrace(detail) : [];

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-72 shrink-0 flex-col border-r-2 border-[var(--hero-ink)]">
        <div className="flex items-center justify-between border-b-2 border-[var(--hero-ink)]/10 px-4 py-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--hero-ink)]/40">
            Runs
          </span>
          {failedCount > 0 ? (
            <span className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-coral)]/15 px-2 py-0.5 text-[10px] font-bold">
              {failedCount} failed
            </span>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
          {loading ? (
            <p className="flex items-center gap-2 text-xs font-semibold text-[var(--hero-ink)]/45">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </p>
          ) : runs.length === 0 ? (
            <p className="text-xs font-medium text-[var(--hero-ink)]/45">
              No runs yet — switch to Dry Run and start a test.
            </p>
          ) : (
            runs.map((run) => (
              <RunListItem
                key={run.id}
                run={run}
                selected={run.id === selectedId}
                onSelect={() => setSelectedId(run.id)}
              />
            ))
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1 bg-white p-4">
        {!selectedId ? (
          <p className="text-sm font-medium text-[var(--hero-ink)]/45">Select a run to inspect.</p>
        ) : detailLoading ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--hero-ink)]/45">
            <Loader2 className="size-4 animate-spin" />
            Loading run…
          </p>
        ) : detail ? (
          <div className="space-y-4">
            <div>
              <h2 className="font-heading text-lg font-extrabold">
                Run {formatRunTime(detail.started_at)}
              </h2>
              <p className="text-xs font-medium text-[var(--hero-ink)]/55">
                {detail.mode} · {detail.status} · rev {detail.workflow_revision}
              </p>
            </div>
            <ExecutionTimeline steps={trace} live={detail.status === "running"} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
