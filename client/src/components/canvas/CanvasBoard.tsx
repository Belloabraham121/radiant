"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Plus, Wand2 } from "lucide-react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { RichNode } from "./RichNode";
import { PriceChartNode } from "./PriceChartNode";
import { AnimatedSVGEdge } from "./AnimatedEdge";
import {
  SAMPLE_EDGES,
  SAMPLE_NODES,
  type CanvasMode,
  type RichNode as RichNodeType,
} from "./canvas-nodes";
import { AddNodePalette } from "./AddNodePalette";
import { NodeDetailModal } from "./node-detail";
import { nodeDataFromCatalog, type NodeCatalogEntry } from "./node-catalog";
import { resolveCollisions } from "./collision";

/** Keep ~16px of breathing room between cards when resolving overlaps. */
const COLLISION_OPTIONS = { maxIterations: 50, overlapThreshold: 0.5, margin: 16 };

gsap.registerPlugin(useGSAP);

let nodeIdSeq = 0;
function nextNodeId(): string {
  nodeIdSeq += 1;
  return `n-${Date.now().toString(36)}-${nodeIdSeq}`;
}

const nodeTypes: NodeTypes = { rich: RichNode, chart: PriceChartNode };
const edgeTypes: EdgeTypes = { animated: AnimatedSVGEdge };

const EDGE_STYLE = { stroke: "var(--hero-ink)", strokeWidth: 2.5 };

/** In Dry/Live, edges use the traveling-dot animated edge to show data flow. */
function styleEdgeForMode<T extends Edge>(edge: T, mode: CanvasMode): T {
  return {
    ...edge,
    type: mode === "build" ? "default" : "animated",
    style: EDGE_STYLE,
  };
}

function edgesForMode(mode: CanvasMode): Edge[] {
  return SAMPLE_EDGES.map((e) => styleEdgeForMode(e, mode));
}

function BoardInner({ mode }: { mode: CanvasMode }) {
  const scope = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView, deleteElements } = useReactFlow();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null);
  // Stateful nodes/edges so they're draggable and connectable.
  const [nodes, setNodes, onNodesChange] = useNodesState<RichNodeType>(SAMPLE_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(edgesForMode("build"));

  // Drop a catalog node at the current viewport center (small jitter so repeated
  // adds don't stack exactly).
  const addNode = useCallback(
    (entry: NodeCatalogEntry) => {
      const rect = scope.current?.getBoundingClientRect();
      const center = rect
        ? screenToFlowPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          })
        : { x: 0, y: 0 };
      const jitter = () => (Math.random() - 0.5) * 60;
      const isChart = entry.nodeType === "chart";
      const node: RichNodeType = {
        id: nextNodeId(),
        type: entry.nodeType ?? "rich",
        position: { x: center.x + jitter(), y: center.y + jitter() },
        data: nodeDataFromCatalog(entry),
        ...(isChart ? { width: 400, height: 280 } : {}),
      };
      setNodes((current) => [...current, node]);
    },
    [screenToFlowPosition, setNodes],
  );

  // Tidy scattered nodes into a clean left→right layered layout (longest-path
  // layering over the edges), then fit them to view.
  const autoLayout = useCallback(() => {
    const COL_GAP = 340;
    const ROW_GAP = 200;
    setNodes((current) => {
      if (current.length === 0) return current;

      const incoming = new Map<string, string[]>();
      current.forEach((n) => incoming.set(n.id, []));
      for (const e of edges) {
        if (incoming.has(e.target)) incoming.get(e.target)!.push(e.source);
      }

      // layer = longest path from a root (indegree 0), with a cycle guard.
      const layer = new Map<string, number>();
      const visiting = new Set<string>();
      const computeLayer = (id: string): number => {
        const cached = layer.get(id);
        if (cached !== undefined) return cached;
        if (visiting.has(id)) return 0;
        visiting.add(id);
        const ins = incoming.get(id) ?? [];
        const l = ins.length === 0 ? 0 : Math.max(...ins.map((s) => computeLayer(s) + 1));
        visiting.delete(id);
        layer.set(id, l);
        return l;
      };
      current.forEach((n) => computeLayer(n.id));

      const byLayer = new Map<number, string[]>();
      current.forEach((n) => {
        const l = layer.get(n.id) ?? 0;
        const bucket = byLayer.get(l) ?? [];
        bucket.push(n.id);
        byLayer.set(l, bucket);
      });

      const pos = new Map<string, { x: number; y: number }>();
      for (const [l, ids] of byLayer) {
        ids.forEach((id, i) => {
          pos.set(id, { x: l * COL_GAP, y: (i - (ids.length - 1) / 2) * ROW_GAP });
        });
      }

      return current.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position }));
    });
    requestAnimationFrame(() => fitView({ padding: 0.2, duration: 400 }));
  }, [edges, fitView, setNodes]);

  // ⌘K / Ctrl+K opens the node palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Swap edges to the animated traveling-dot type in Dry/Live (preserves links).
  useEffect(() => {
    setEdges((current) => current.map((e) => styleEdgeForMode(e, mode)));
  }, [mode, setEdges]);

  // Signature moment: nodes pop in (back.out) like the agent is assembling
  // the graph in front of you. Reduced-motion → instant.
  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from("[data-canvas-card]", {
        scale: 0.6,
        opacity: 0,
        y: 30,
        duration: 0.55,
        stagger: 0.1,
        ease: "back.out(1.7)",
        delay: 0.15,
      });
    },
    { scope, dependencies: [] },
  );

  const detailNode = detailNodeId ? (nodes.find((n) => n.id === detailNodeId) ?? null) : null;

  const frameClass =
    mode === "live"
      ? "ring-4 ring-inset ring-[var(--hero-mint)]"
      : mode === "dry"
        ? "ring-4 ring-inset ring-[var(--hero-amber)] [--rf-ring:dashed]"
        : "";

  return (
    <div
      ref={scope}
      className={`relative h-full w-full ${frameClass}`}
    >
      {/* Add node — opens the searchable command palette */}
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="absolute left-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-white px-3 py-1.5 text-xs font-bold transition-transform hover:-translate-y-0.5"
      >
        <Plus className="size-3.5" strokeWidth={3} />
        Add node
        <kbd className="ml-1 rounded-md border-2 border-[var(--hero-ink)]/15 px-1 py-0.5 text-[9px] font-bold text-[var(--hero-ink)]/40">
          ⌘K
        </kbd>
      </button>

      {paletteOpen ? (
        <AddNodePalette onClose={() => setPaletteOpen(false)} onAdd={addNode} />
      ) : null}

      {detailNode ? (
        <NodeDetailModal
          node={detailNode}
          onClose={() => setDetailNodeId(null)}
          onDelete={() => {
            void deleteElements({ nodes: [{ id: detailNode.id }] });
            setDetailNodeId(null);
          }}
        />
      ) : null}

      {mode !== "build" ? (
        <span
          className={`pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border-2 border-[var(--hero-ink)] px-3 py-1 text-xs font-bold uppercase tracking-[0.15em] shadow-[2px_2px_0_var(--hero-ink)] ${
            mode === "live"
              ? "bg-[var(--hero-mint)] text-[var(--hero-ink)]"
              : "bg-[var(--hero-amber)] text-[var(--hero-ink)]"
          }`}
        >
          {mode === "live" ? "● Live — real execution" : "Dry run — simulated"}
        </span>
      ) : null}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={(c: Connection) =>
          setEdges((eds) =>
            addEdge(
              { ...c, type: mode === "build" ? "default" : "animated", style: EDGE_STYLE },
              eds,
            ),
          )
        }
        onNodeClick={(_, node) => {
          // Chart nodes are self-contained (inline controls) — no detail modal.
          if (node.type !== "chart") setDetailNodeId(node.id);
        }}
        onNodeDragStop={() =>
          setNodes((current) => resolveCollisions(current, COLLISION_OPTIONS))
        }
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "default" }}
        deleteKeyCode={["Backspace", "Delete"]}
        minZoom={0.3}
        maxZoom={1.8}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={2}
          color="rgba(27,22,16,0.12)"
        />
        <Controls
          showInteractive={false}
          className="!border-0 !bg-transparent !shadow-none"
          style={{ bottom: 120 }}
        >
          <ControlButton onClick={autoLayout} title="Tidy layout">
            <Wand2 />
          </ControlButton>
        </Controls>
        <MiniMap
          position="top-right"
          pannable
          zoomable
          className="!rounded-xl !border-2 !border-[var(--hero-ink)] !shadow-none"
          maskColor="rgba(27,22,16,0.08)"
          nodeColor={(n) => {
            const cat = (n.data as RichNodeType["data"])?.category;
            const map: Record<string, string> = {
              control: "#1b1610",
              data: "#3865ff",
              logic: "#8e5bff",
              action: "#ff5d46",
              ui: "#00c478",
              ai: "#ffb01f",
            };
            return map[cat] ?? "#1b1610";
          }}
        />
      </ReactFlow>
    </div>
  );
}

export function CanvasBoard({ mode }: { mode: CanvasMode }) {
  return (
    <ReactFlowProvider>
      <BoardInner mode={mode} />
    </ReactFlowProvider>
  );
}
