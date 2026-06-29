"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Edge } from "@xyflow/react";
import { ArrowUp, LayoutDashboard, ListChecks, Sparkles } from "lucide-react";
import { SidebarToggle } from "@/components/app/Sidebar";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasBoardStateful } from "./CanvasBoard";
import { CanvasRunsPanel } from "./CanvasRunsPanel";
import { useActiveCanvasWorkflow } from "./canvas-workflow-context";
import type { CanvasMode, RichNode } from "./canvas-nodes";
import { streamCanvasBuild, type CanvasBuildStreamEvent } from "@/lib/canvas-api";
import { applyBuildStreamEvent, canvasGraphToFlow } from "@/lib/canvas-graph-mapper";
import type { CanvasLlmModelTier } from "@/lib/canvas-types";

type CanvasTab = "editor" | "runs";

const CANVAS_INPUT_COL = "mx-auto w-full max-w-[53.76rem]";

const TABS: Array<{ id: CanvasTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: "editor", label: "Editor", icon: LayoutDashboard },
  { id: "runs", label: "Runs", icon: ListChecks },
];

const STATUS_DOT: Record<string, string> = {
  draft: "var(--hero-ink)",
  dry_run_ready: "var(--hero-amber)",
  live: "var(--hero-mint)",
  paused: "var(--hero-violet)",
  archived: "rgba(27,22,16,0.35)",
};

export function CanvasWorkspace() {
  const {
    workflow,
    loading,
    error,
    buildConfig,
    setBuildConfig,
    dryRunReady,
    setDryRunReady,
    buildLog,
    appendBuildLog,
    clearBuildLog,
    refreshWorkflow,
  } = useActiveCanvasWorkflow();

  const [mode, setMode] = useState<CanvasMode>("build");
  const [tab, setTab] = useState<CanvasTab>("editor");
  const [input, setInput] = useState("");
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const baseGraph = useMemo(() => {
    if (!workflow) return { nodes: [] as RichNode[], edges: [] as Edge[] };
    return canvasGraphToFlow(workflow.graph.nodes, workflow.graph.edges, mode);
  }, [workflow, mode]);

  const [liveNodes, setLiveNodes] = useState<RichNode[] | null>(null);
  const [liveEdges, setLiveEdges] = useState<Edge[] | null>(null);
  const graphRef = useRef({ nodes: baseGraph.nodes, edges: baseGraph.edges });

  const graphNodes = liveNodes ?? baseGraph.nodes;
  const graphEdges = liveEdges ?? baseGraph.edges;

  useEffect(() => {
    graphRef.current = { nodes: graphNodes, edges: graphEdges };
  }, [graphNodes, graphEdges]);

  const handleBuildEvent = useCallback(
    (event: CanvasBuildStreamEvent) => {
      if (event.event === "workflow.build.complete") {
        appendBuildLog(`✓ ${event.data.summary}`);
        setDryRunReady(true);
        setLiveNodes(null);
        setLiveEdges(null);
        void refreshWorkflow();
        return;
      }
      if (event.event === "workflow.build.error") {
        setBuildError(event.data.message);
        appendBuildLog(`✗ ${event.data.message}`);
        return;
      }
      if (event.event === "workflow.node.add") {
        appendBuildLog(`+ node ${event.data.node.type}`);
      }
      if (event.event === "workflow.edge.add") {
        appendBuildLog(`+ edge ${event.data.edge.id.slice(0, 8)}…`);
      }

      const patch = applyBuildStreamEvent(
        event,
        graphRef.current.nodes,
        graphRef.current.edges,
        mode,
      );
      graphRef.current = { nodes: patch.nodes, edges: patch.edges };
      setLiveNodes(patch.nodes);
      setLiveEdges(patch.edges);
      if (patch.focusNodeId) setFocusNodeId(patch.focusNodeId);
    },
    [appendBuildLog, mode, refreshWorkflow, setDryRunReady],
  );

  const submitBuild = useCallback(async () => {
    if (!workflow || !input.trim() || building) return;
    setBuilding(true);
    setBuildError(null);
    clearBuildLog();
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      await streamCanvasBuild(
        workflow.id,
        input.trim(),
        handleBuildEvent,
        abortRef.current.signal,
      );
      setInput("");
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setBuildError(err.message);
      }
    } finally {
      setBuilding(false);
    }
  }, [workflow, input, building, clearBuildLog, handleBuildEvent]);

  const handleModelTierChange = useCallback(
    async (tier: CanvasLlmModelTier) => {
      await setBuildConfig({ ...buildConfig, model_tier: tier });
    },
    [buildConfig, setBuildConfig],
  );

  if (loading && !workflow) {
    return (
      <div className="flex h-full items-center justify-center text-sm font-semibold text-[var(--hero-ink)]/45">
        Loading workflow…
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm font-semibold text-[var(--hero-coral)]">
        {error ?? "Workflow not found"}
      </div>
    );
  }

  const statusDot = STATUS_DOT[workflow.status] ?? STATUS_DOT.draft;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--hero-bg)]">
      <div className="flex flex-wrap items-center gap-3 border-b-2 border-[var(--hero-ink)] px-4 py-3">
        <SidebarToggle />
        <span className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: statusDot }} />
          <h1 className="font-heading text-xl font-extrabold tracking-tight">{workflow.name}</h1>
        </span>
        <span className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-violet)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
          rev {workflow.revision}
        </span>

        <div className="ml-auto flex items-center gap-1 rounded-full border-2 border-[var(--hero-ink)] bg-white p-1">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition-colors ${
                  active
                    ? "bg-[var(--hero-ink)] text-[var(--hero-bg)]"
                    : "text-[var(--hero-ink)]/55 hover:text-[var(--hero-ink)]"
                }`}
              >
                <Icon className="size-4" strokeWidth={2.5} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "runs" ? (
        <div className="min-h-0 flex-1">
          <CanvasRunsPanel />
        </div>
      ) : (
        <>
          <CanvasToolbar
            mode={mode}
            onModeChange={setMode}
            modelTier={buildConfig.model_tier}
            onModelTierChange={handleModelTierChange}
            dryRunReady={dryRunReady}
          />

          <div className="relative min-h-0 flex-1">
            <CanvasBoardStateful
              mode={mode}
              initialNodes={graphNodes}
              initialEdges={graphEdges}
              focusNodeId={focusNodeId}
            />

            {buildLog.length > 0 ? (
              <div className="pointer-events-none absolute left-4 bottom-28 z-10 max-w-xs rounded-xl border-2 border-[var(--hero-ink)] bg-white/95 px-3 py-2 text-[11px] font-semibold shadow-[2px_2px_0_var(--hero-ink)]">
                <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-[var(--hero-ink)]/40">
                  Build log
                </p>
                <ul className="max-h-24 space-y-0.5 overflow-y-auto">
                  {buildLog.map((line, i) => (
                    <li key={`${line}-${i}`} className="text-[var(--hero-ink)]/75">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 px-6 pb-4">
              <form
                className="pointer-events-auto"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitBuild();
                }}
              >
                <div
                  className={`${CANVAS_INPUT_COL} flex min-h-[4.5rem] flex-col gap-2 rounded-3xl border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] px-5 pb-3 pt-4 shadow-[3px_3px_0_var(--hero-ink)]`}
                >
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void submitBuild();
                      }
                    }}
                    placeholder="Describe a workflow — “When BTC drops 5%, buy the whale’s Polymarket position…”"
                    rows={1}
                    disabled={building || mode !== "build"}
                    className="max-h-40 min-h-6 w-full resize-none overflow-y-auto bg-transparent text-sm font-semibold leading-5 placeholder:text-[var(--hero-ink)]/35 focus:outline-none disabled:opacity-50"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--hero-ink)]/40">
                      <Sparkles className="size-3 text-[var(--hero-amber)]" strokeWidth={3} />
                      Builder · {buildConfig.model_tier}
                    </span>
                    <button
                      type="submit"
                      aria-label="Send"
                      disabled={!input.trim() || building || mode !== "build"}
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--hero-ink)] text-[var(--hero-bg)] transition-transform hover:-translate-y-0.5 disabled:opacity-40"
                    >
                      <ArrowUp className="size-5" strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
                {buildError ? (
                  <p
                    className={`${CANVAS_INPUT_COL} mt-2 text-center text-[11px] font-semibold text-[var(--hero-coral)]`}
                    role="alert"
                  >
                    {buildError}
                  </p>
                ) : (
                  <p
                    className={`${CANVAS_INPUT_COL} mt-2 text-center text-[11px] font-medium text-[var(--hero-ink)]/35`}
                  >
                    The Builder agent assembles your workflow. Live actions always ask first.
                  </p>
                )}
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
