"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Edge } from "@xyflow/react";
import { ArrowUp, LayoutDashboard, ListChecks } from "lucide-react";
import { SidebarToggle } from "@/components/app/Sidebar";
import { ExecutionTimeline } from "@/components/app/ExecutionTimeline";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasPolicyPanel } from "./CanvasPolicyPanel";
import { CanvasModelPicker } from "./CanvasModelPicker";
import { CanvasBuilderActivity } from "./CanvasBuilderActivity";
import { CanvasBoardStateful } from "./CanvasBoard";
import { CanvasRunsPanel } from "./CanvasRunsPanel";
import { useActiveCanvasWorkflow } from "./canvas-workflow-context";
import type { CanvasMode, RichNode } from "./canvas-nodes";
import { streamCanvasBuild, streamCanvasDryRun, streamCanvasLive, activateCanvasKillSwitch, getCanvasWorkflowPolicy, type CanvasBuildStreamEvent } from "@/lib/canvas-api";
import { applyBuildStreamEvent, canvasGraphToFlow } from "@/lib/canvas-graph-mapper";
import type { CanvasLlmModelTier } from "@/lib/canvas-types";
import type { CanvasDryRunStreamEvent } from "@/lib/canvas-dry-run";
import { liveEventToExecutionStep } from "@/lib/canvas-live";
import type { CanvasLiveStreamEvent } from "@/lib/canvas-live";
import {
  applyDryRunNodeBadge,
  dryRunEventToExecutionStep,
  type DryRunNodeBadge,
} from "@/lib/canvas-dry-run";
import {
  buildStreamEventToActivity,
  createBuilderActivityEntry,
  type BuilderActivityEntry,
} from "@/lib/canvas-build";
import type { ExecutionStep } from "@/lib/chat-execution-steps";

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

function applyDryRunBadgesToNodes(nodes: RichNode[], badges: Map<string, DryRunNodeBadge>): RichNode[] {
  if (badges.size === 0) return nodes;
  return nodes.map((node) => {
    const badge = badges.get(node.id);
    if (!badge) return node;
    return {
      ...node,
      data: {
        ...node.data,
        dryRunSimulated: badge.simulated,
        dryRunStatus: badge.status,
      },
    };
  });
}

export function CanvasWorkspace() {
  const {
    workflow,
    loading,
    error,
    buildConfig,
    testerConfig,
    setBuildConfig,
    setTesterConfig,
    dryRunReady,
    setDryRunReady,
    dryRunLog,
    appendDryRunLog,
    clearDryRunLog,
    refreshWorkflow,
  } = useActiveCanvasWorkflow();

  const [mode, setMode] = useState<CanvasMode>("build");
  const [tab, setTab] = useState<CanvasTab>("editor");
  const [input, setInput] = useState("");
  const [building, setBuilding] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [liveRunning, setLiveRunning] = useState(false);
  const [policyPanelOpen, setPolicyPanelOpen] = useState(false);
  const [policyDetail, setPolicyDetail] = useState<import("@/lib/canvas-api").CanvasPolicyDetail | null>(null);
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [liveConfirmOpen, setLiveConfirmOpen] = useState(false);
  const [liveSteps, setLiveSteps] = useState<ExecutionStep[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [dryRunError, setDryRunError] = useState<string | null>(null);
  const [buildActivity, setBuildActivity] = useState<BuilderActivityEntry[]>([]);
  const [buildActivityOpen, setBuildActivityOpen] = useState(false);
  const [buildActivityCollapsed, setBuildActivityCollapsed] = useState(false);
  const buildCompletedRef = useRef(false);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [dryRunSteps, setDryRunSteps] = useState<ExecutionStep[]>([]);
  const [dryRunBadges, setDryRunBadges] = useState<Map<string, DryRunNodeBadge>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  const baseGraph = useMemo(() => {
    if (!workflow) return { nodes: [] as RichNode[], edges: [] as Edge[] };
    return canvasGraphToFlow(workflow.graph.nodes, workflow.graph.edges, mode);
  }, [workflow, mode]);

  const [liveNodes, setLiveNodes] = useState<RichNode[] | null>(null);
  const [liveEdges, setLiveEdges] = useState<Edge[] | null>(null);
  const graphRef = useRef({ nodes: baseGraph.nodes, edges: baseGraph.edges });

  const graphNodesRaw = liveNodes ?? baseGraph.nodes;
  const graphNodes = useMemo(
    () => applyDryRunBadgesToNodes(graphNodesRaw, dryRunBadges),
    [graphNodesRaw, dryRunBadges],
  );
  const graphEdges = liveEdges ?? baseGraph.edges;

  const nodeTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of graphNodes) map.set(n.id, n.data.title);
    return map;
  }, [graphNodes]);

  useEffect(() => {
    graphRef.current = { nodes: graphNodes, edges: graphEdges };
  }, [graphNodes, graphEdges]);

  const appendBuildActivity = useCallback((entry: BuilderActivityEntry) => {
    setBuildActivity((prev) => [...prev, entry]);
  }, []);

  const handleBuildEvent = useCallback(
    (event: CanvasBuildStreamEvent) => {
      const mapped = buildStreamEventToActivity(event);
      if (mapped) {
        const entries = Array.isArray(mapped) ? mapped : [mapped];
        setBuildActivity((prev) => [...prev, ...entries]);
      }

      if (event.event === "workflow.build.complete") {
        buildCompletedRef.current = true;
        setDryRunReady(true);
        setLiveNodes(null);
        setLiveEdges(null);
        void refreshWorkflow();
        return;
      }
      if (event.event === "workflow.build.error") {
        buildCompletedRef.current = true;
        setBuildError(event.data.message);
        return;
      }
      if (event.event === "workflow.build.ack") {
        buildCompletedRef.current = true;
        return;
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
    [mode, refreshWorkflow, setDryRunReady],
  );

  useEffect(() => {
    if (!workflow) return;
    void getCanvasWorkflowPolicy(workflow.id)
      .then((p) => setKillSwitchActive(p.kill_switch_active))
      .catch(() => undefined);
  }, [workflow]);

  const handleLiveEvent = useCallback(
    (event: CanvasLiveStreamEvent) => {
      if (event.event === "workflow.run.error") {
        setLiveError(event.data.message);
      }
      if (event.event === "workflow.run.killed") {
        setKillSwitchActive(true);
      }
      const step = liveEventToExecutionStep(event, nodeTitleById);
      if (step) {
        setLiveSteps((prev) => {
          const idx = prev.findIndex((s) => s.id === step.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = step;
            return next;
          }
          return [...prev, step];
        });
      }
    },
    [nodeTitleById],
  );

  const submitLive = useCallback(async () => {
    if (!workflow || liveRunning) return;
    setLiveRunning(true);
    setLiveError(null);
    setLiveSteps([]);
    setLiveConfirmOpen(false);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      await streamCanvasLive(
        workflow.id,
        handleLiveEvent,
        { confirmLive: true, signal: abortRef.current.signal },
      );
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setLiveError(err.message);
      }
    } finally {
      setLiveRunning(false);
      void refreshWorkflow();
    }
  }, [workflow, liveRunning, handleLiveEvent, refreshWorkflow]);

  const handleKillSwitch = useCallback(async () => {
    if (!workflow) return;
    try {
      const policy = await activateCanvasKillSwitch(workflow.id);
      setKillSwitchActive(policy.kill_switch_active);
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : "Kill switch failed");
    }
  }, [workflow]);

  const handleModeChange = useCallback(
    (next: CanvasMode) => {
      if (next === "live" && mode !== "live") {
        setLiveConfirmOpen(true);
      }
      setMode(next);
    },
    [mode],
  );

  const handleDryRunEvent = useCallback(
    (event: CanvasDryRunStreamEvent) => {
      if (event.event === "workflow.run.node.complete") {
        appendDryRunLog(
          `${event.data.simulated ? "◎" : "•"} ${event.data.node_type}${event.data.detail ? ` — ${event.data.detail}` : ""}`,
        );
      }
      if (event.event === "workflow.run.policy.warning") {
        for (const w of event.data.warnings) {
          appendDryRunLog(`⚠ ${w.message}`);
        }
      }
      if (event.event === "workflow.run.complete") {
        appendDryRunLog(`✓ ${event.data.summary}`);
      }
      if (event.event === "workflow.run.error") {
        setDryRunError(event.data.message);
        appendDryRunLog(`✗ ${event.data.message}`);
      }

      setDryRunBadges((prev) => applyDryRunNodeBadge(prev, event));
      const step = dryRunEventToExecutionStep(event, nodeTitleById);
      if (step) {
        setDryRunSteps((prev) => {
          const idx = prev.findIndex((s) => s.id === step.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = step;
            return next;
          }
          return [...prev, step];
        });
      }
    },
    [appendDryRunLog, nodeTitleById],
  );

  const submitBuild = useCallback(async () => {
    if (!workflow || !input.trim() || building) return;
    setBuilding(true);
    setBuildError(null);
    buildCompletedRef.current = false;
    setBuildActivity([]);
    setBuildActivityOpen(true);
    setBuildActivityCollapsed(false);
    appendBuildActivity(
      createBuilderActivityEntry("status", `You: ${input.trim().slice(0, 120)}${input.trim().length > 120 ? "…" : ""}`),
    );
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      await streamCanvasBuild(
        workflow.id,
        input.trim(),
        handleBuildEvent,
        abortRef.current.signal,
      );
      if (!buildCompletedRef.current) {
        const msg = "Build stream ended without completing — try again or use a clearer workflow description.";
        setBuildError(msg);
        appendBuildActivity(createBuilderActivityEntry("error", msg));
      } else {
        setInput("");
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setBuildError(err.message);
        appendBuildActivity(createBuilderActivityEntry("error", err.message));
      }
    } finally {
      setBuilding(false);
    }
  }, [workflow, input, building, appendBuildActivity, handleBuildEvent]);

  const submitDryRun = useCallback(async () => {
    if (!workflow || dryRunning || !dryRunReady) return;
    setDryRunning(true);
    setDryRunError(null);
    clearDryRunLog();
    setDryRunSteps([]);
    setDryRunBadges(new Map());
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      await streamCanvasDryRun(
        workflow.id,
        handleDryRunEvent,
        {
          message: input.trim() || undefined,
          signal: abortRef.current.signal,
        },
      );
      setInput("");
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setDryRunError(err.message);
      }
    } finally {
      setDryRunning(false);
    }
  }, [workflow, dryRunning, dryRunReady, input, clearDryRunLog, handleDryRunEvent]);

  const handleModelTierChange = useCallback(
    async (tier: CanvasLlmModelTier) => {
      if (mode === "dry") {
        await setTesterConfig({ ...testerConfig, model_tier: tier });
      } else {
        await setBuildConfig({ ...buildConfig, model_tier: tier });
      }
    },
    [mode, buildConfig, testerConfig, setBuildConfig, setTesterConfig],
  );

  const activeModelTier = mode === "dry" ? testerConfig.model_tier : buildConfig.model_tier;
  const chatBusy = building || dryRunning || liveRunning;
  const canSubmit =
    mode === "build"
      ? Boolean(input.trim()) && !chatBusy
      : mode === "dry"
        ? dryRunReady && !chatBusy
        : !liveRunning && !killSwitchActive;

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
  const activityLog = dryRunLog;
  const activityLabel = "Dry run log";

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
          <CanvasRunsPanel workflowId={workflow.id} />
        </div>
      ) : (
        <>
          <CanvasToolbar
            mode={mode}
            onModeChange={handleModeChange}
            dryRunReady={dryRunReady}
            onPolicyClick={() => {
              void getCanvasWorkflowPolicy(workflow.id)
                .then((p) => {
                  setPolicyDetail(p);
                  setPolicyPanelOpen(true);
                })
                .catch((err) => {
                  setLiveError(err instanceof Error ? err.message : "Failed to load policy");
                });
            }}
            onKillClick={() => void handleKillSwitch()}
            killSwitchActive={killSwitchActive}
            liveRunning={liveRunning}
          />

          <CanvasPolicyPanel
            workflowId={workflow.id}
            policy={policyDetail}
            open={policyPanelOpen}
            onClose={() => setPolicyPanelOpen(false)}
            onPolicyUpdated={(p) => {
              setPolicyDetail(p);
              setKillSwitchActive(p.kill_switch_active);
            }}
          />

          {liveConfirmOpen && mode === "live" ? (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--hero-ink)]/25 p-4">
              <div className="max-w-sm rounded-2xl border-2 border-[var(--hero-ink)] bg-white p-5 shadow-[4px_4px_0_var(--hero-ink)]">
                <h2 className="font-heading text-lg font-extrabold">Enable Live execution?</h2>
                <p className="mt-2 text-sm font-medium text-[var(--hero-ink)]/65">
                  Live runs execute real actions (swap, Polymarket orders) subject to your workflow policy.
                  Use Kill to halt immediately.
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setLiveConfirmOpen(false)}
                    className="flex-1 rounded-full border-2 border-[var(--hero-ink)] px-3 py-2 text-sm font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitLive()}
                    className="flex-1 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)] px-3 py-2 text-sm font-bold shadow-[2px_2px_0_var(--hero-ink)]"
                  >
                    Run Live
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="relative min-h-0 flex-1">
            <CanvasBoardStateful
              mode={mode}
              initialNodes={graphNodes}
              initialEdges={graphEdges}
              focusNodeId={focusNodeId}
            />

            {mode === "dry" && activityLog.length > 0 ? (
              <div className="pointer-events-none absolute left-4 bottom-28 z-10 max-w-xs rounded-xl border-2 border-[var(--hero-ink)] bg-white/95 px-3 py-2 text-[11px] font-semibold shadow-[2px_2px_0_var(--hero-ink)]">
                <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-[var(--hero-ink)]/40">
                  {activityLabel}
                </p>
                <ul className="max-h-24 space-y-0.5 overflow-y-auto">
                  {activityLog.map((line, i) => (
                    <li key={`${line}-${i}`} className="text-[var(--hero-ink)]/75">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {mode === "live" && liveSteps.length > 0 ? (
              <div className="pointer-events-none absolute right-4 bottom-28 z-10 w-80 max-w-[40vw]">
                <div className="pointer-events-auto">
                  <ExecutionTimeline steps={liveSteps} live={liveRunning} />
                </div>
              </div>
            ) : null}

            {mode === "dry" && dryRunSteps.length > 0 ? (
              <div className="pointer-events-none absolute right-4 bottom-28 z-10 w-80 max-w-[40vw]">
                <div className="pointer-events-auto">
                  <ExecutionTimeline steps={dryRunSteps} live={dryRunning} />
                </div>
              </div>
            ) : null}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-3 px-6 pb-4">
              {mode === "build" ? (
                <CanvasBuilderActivity
                  entries={buildActivity}
                  building={building}
                  open={buildActivityOpen}
                  collapsed={buildActivityCollapsed}
                  onToggleCollapse={() => setBuildActivityCollapsed((prev) => !prev)}
                  onDismiss={() => {
                    setBuildActivityOpen(false);
                    setBuildActivity([]);
                  }}
                  inputColumnClass={CANVAS_INPUT_COL}
                />
              ) : null}

              <form
                className="pointer-events-auto"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (mode === "live") {
                    setLiveConfirmOpen(true);
                    return;
                  }
                  if (mode === "dry") void submitDryRun();
                  else void submitBuild();
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
                        if (mode === "dry") void submitDryRun();
                        else void submitBuild();
                      }
                    }}
                    placeholder={
                      mode === "dry"
                        ? "Optional note for Tester — leave empty to run full dry simulation…"
                        : mode === "live"
                          ? "Live mode — confirm to execute real actions…"
                          : "Describe a workflow — “When BTC drops 5%, buy the whale’s Polymarket position…”"
                    }
                    rows={1}
                    disabled={
                      chatBusy ||
                      (mode === "dry" && !dryRunReady) ||
                      (mode === "live" && killSwitchActive)
                    }
                    className="max-h-40 min-h-6 w-full resize-none overflow-y-auto bg-transparent text-sm font-semibold leading-5 placeholder:text-[var(--hero-ink)]/35 focus:outline-none disabled:opacity-50"
                  />
                  <div className="flex items-center justify-between gap-2">
                    {mode === "build" || mode === "dry" ? (
                      <CanvasModelPicker
                        variant="footer"
                        agentLabel={mode === "dry" ? "Tester" : "Builder"}
                        modelTier={activeModelTier}
                        onModelTierChange={handleModelTierChange}
                        disabled={chatBusy || (mode === "dry" && !dryRunReady)}
                      />
                    ) : (
                      <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--hero-ink)]/40">
                        Live
                      </span>
                    )}
                    <button
                      type="submit"
                      aria-label={
                        mode === "live" ? "Confirm live run" : mode === "dry" ? "Run dry test" : "Send"
                      }
                      disabled={!canSubmit}
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--hero-ink)] text-[var(--hero-bg)] transition-transform hover:-translate-y-0.5 disabled:opacity-40"
                    >
                      <ArrowUp className="size-5" strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
                {(mode === "build" ? buildError : mode === "live" ? liveError : dryRunError) ? (
                  <p
                    className={`${CANVAS_INPUT_COL} mt-2 text-center text-[11px] font-semibold text-[var(--hero-coral)]`}
                    role="alert"
                  >
                    {mode === "build" ? buildError : mode === "live" ? liveError : dryRunError}
                  </p>
                ) : (
                  <p
                    className={`${CANVAS_INPUT_COL} mt-2 text-center text-[11px] font-medium text-[var(--hero-ink)]/35`}
                  >
                    {mode === "dry"
                      ? "Tester dry-runs the graph with simulated actions — no on-chain submit."
                      : mode === "live"
                        ? "Live executes swap + Polymarket nodes with policy enforcement. Kill switch halts before sign."
                        : "The Builder agent assembles your workflow. Live actions always ask first."}
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
