"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Hand, MousePointer2, Plus, Wand2 } from "lucide-react";
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
  type OnEdgesChange,
  type OnNodesChange,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { RichNode } from "./RichNode";
import { PriceChartNode } from "./PriceChartNode";
import { AnimatedSVGEdge } from "./AnimatedEdge";
import { type CanvasMode, type RichNode as RichNodeType } from "./canvas-nodes";
import { AddNodePalette } from "./AddNodePalette";
import { NodeDetailModal } from "./node-detail";
import { nodeDataFromCatalog, type NodeCatalogEntry } from "./node-catalog";
import { nodeNeedsInspectorFocus } from "@/lib/canvas-graph-mapper";
import { resolveCollisions } from "./collision";

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

type CanvasInteractionMode = "pan" | "select";

const TOOL_BTN =
  "inline-flex size-7 items-center justify-center rounded-full transition-colors hover:bg-[var(--hero-ink)]/5";
const TOOL_BTN_ACTIVE = "bg-[var(--hero-ink)] text-white hover:bg-[var(--hero-ink)]";

function styleEdgeForMode<T extends Edge>(edge: T, mode: CanvasMode): T {
  return {
    ...edge,
    type: mode === "build" ? "step" : "animated",
    style: EDGE_STYLE,
  };
}

type BoardInnerProps = {
  mode: CanvasMode;
  nodes: RichNodeType[];
  edges: Edge[];
  onNodesChange: OnNodesChange<RichNodeType>;
  onEdgesChange: OnEdgesChange;
  setNodes: React.Dispatch<React.SetStateAction<RichNodeType[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  focusNodeId?: string | null;
  onNodesDelete?: (nodes: Node[]) => void;
};

function BoardInner({
  mode,
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  setNodes,
  setEdges,
  focusNodeId,
  onNodesDelete,
}: BoardInnerProps) {
  const scope = useRef<HTMLDivElement>(null);
  const introAnimatedRef = useRef(false);
  const { screenToFlowPosition, fitView, deleteElements, setCenter } = useReactFlow();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [interactionMode, setInteractionMode] = useState<CanvasInteractionMode>("pan");
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null);
  const prevFocusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusNodeId || focusNodeId === prevFocusRef.current) return;
    prevFocusRef.current = focusNodeId;
    const node = nodes.find((n) => n.id === focusNodeId);
    if (!node) return;
    const x = node.position.x + (node.width ?? 96) / 2;
    const y = node.position.y + (node.height ?? 56) / 2;
    setCenter(x, y, { zoom: 1.1, duration: 450 });
    if (mode === "build" && nodeNeedsInspectorFocus(node.data)) {
      queueMicrotask(() => setDetailNodeId(focusNodeId));
    }
  }, [focusNodeId, nodes, setCenter, mode]);

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

  useEffect(() => {
    setEdges((current) => current.map((e) => styleEdgeForMode(e, mode)));
  }, [mode, setEdges]);

  useGSAP(
    () => {
      if (introAnimatedRef.current) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      introAnimatedRef.current = true;
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
    { scope },
  );

  const detailNode = detailNodeId ? (nodes.find((n) => n.id === detailNodeId) ?? null) : null;

  const frameClass =
    mode === "live"
      ? "ring-4 ring-inset ring-[var(--hero-mint)]"
      : mode === "dry"
        ? "ring-4 ring-inset ring-[var(--hero-amber)] [--rf-ring:dashed]"
        : "";

  return (
    <div ref={scope} className={`relative h-full w-full ${frameClass}`}>
      <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-white px-3 py-1.5 text-xs font-bold transition-transform hover:-translate-y-0.5"
        >
          <Plus className="size-3.5" strokeWidth={3} />
          Add node
          <kbd className="ml-1 rounded-md border-2 border-[var(--hero-ink)]/15 px-1 py-0.5 text-[9px] font-bold text-[var(--hero-ink)]/40">
            ⌘K
          </kbd>
        </button>

        <div
          className="inline-flex items-center gap-0.5 rounded-full border-2 border-[var(--hero-ink)] bg-white p-0.5"
          role="group"
          aria-label="Canvas interaction mode"
        >
          <button
            type="button"
            title="Pan — drag to move canvas"
            aria-pressed={interactionMode === "pan"}
            onClick={() => setInteractionMode("pan")}
            className={`${TOOL_BTN} ${interactionMode === "pan" ? TOOL_BTN_ACTIVE : "text-[var(--hero-ink)]"}`}
          >
            <Hand className="size-3.5" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            title="Select — drag to marquee select"
            aria-pressed={interactionMode === "select"}
            onClick={() => setInteractionMode("select")}
            className={`${TOOL_BTN} ${interactionMode === "select" ? TOOL_BTN_ACTIVE : "text-[var(--hero-ink)]"}`}
          >
            <MousePointer2 className="size-3.5" strokeWidth={2.5} />
          </button>
        </div>
      </div>

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
        onNodesDelete={onNodesDelete}
        onConnect={(c: Connection) =>
          setEdges((eds) =>
            addEdge(
              { ...c, type: mode === "build" ? "step" : "animated", style: EDGE_STYLE },
              eds,
            ),
          )
        }
        onNodeClick={(_, node) => {
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
        defaultEdgeOptions={{ type: "step" }}
        elementsSelectable
        selectionOnDrag={interactionMode === "select"}
        panOnDrag={interactionMode === "pan" ? true : [1, 2]}
        panActivationKeyCode="Space"
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

export type CanvasBoardProps = {
  mode: CanvasMode;
  nodes: RichNodeType[];
  edges: Edge[];
  onNodesChange: OnNodesChange<RichNodeType>;
  onEdgesChange: OnEdgesChange;
  setNodes: React.Dispatch<React.SetStateAction<RichNodeType[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  focusNodeId?: string | null;
  onNodesDelete?: (nodes: Node[]) => void;
};

function BoardControlled(props: CanvasBoardProps) {
  return (
    <ReactFlowProvider>
      <BoardInner {...props} />
    </ReactFlowProvider>
  );
}

/** Convenience wrapper when parent does not control graph state. */
export function CanvasBoardStateful({
  mode,
  initialNodes = [],
  initialEdges = [],
  focusNodeId,
  graphRevision = 0,
  onNodesDelete,
}: {
  mode: CanvasMode;
  initialNodes?: RichNodeType[];
  initialEdges?: Edge[];
  focusNodeId?: string | null;
  /** Bump when the persisted workflow graph revision changes — avoids clobbering local edits. */
  graphRevision?: number;
  onNodesDelete?: (nodes: Node[]) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<RichNodeType>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const lastSyncedRevisionRef = useRef(graphRevision);

  useEffect(() => {
    if (lastSyncedRevisionRef.current === graphRevision) return;
    lastSyncedRevisionRef.current = graphRevision;
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [graphRevision, initialNodes, initialEdges, setNodes, setEdges]);

  return (
    <BoardControlled
      mode={mode}
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      setNodes={setNodes}
      setEdges={setEdges}
      focusNodeId={focusNodeId}
      onNodesDelete={onNodesDelete}
    />
  );
}

export { BoardControlled as CanvasBoard };
