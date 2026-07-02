"use client";

import { memo } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Trash2 } from "lucide-react";
import {
  CATEGORY_COLOR,
  getNodeStatus,
  PORT_COLOR,
  STATUS_DOT_COLOR,
  type CanvasPort,
  type RichNode as RichNodeType,
} from "./canvas-nodes";
import { NodeGlyph, isBrandIcon, isImageLogo } from "./node-glyph";

/** Card height — ports anchor along the straight left/right edges. */
const SHAPE_H = 64;

/** Ports spread evenly down each edge. */
function portTop(index: number, count: number) {
  return ((index + 1) / (count + 1)) * SHAPE_H;
}

function PortHandle({
  port,
  side,
  index,
  count,
}: {
  port: CanvasPort;
  side: "in" | "out";
  index: number;
  count: number;
}) {
  const isLeft = side === "in";
  return (
    <Handle
      type={isLeft ? "target" : "source"}
      position={isLeft ? Position.Left : Position.Right}
      id={`${isLeft ? "in" : "out"}-${port.kind}`}
      style={{
        top: portTop(index, count),
        width: 12,
        height: 12,
        background: PORT_COLOR[port.kind],
        border: "2px solid var(--hero-ink)",
        borderRadius: port.kind === "data" ? "999px" : "3px",
      }}
    />
  );
}

/**
 * Workflow node — matches the landing-page canvas cards: a wide cream card
 * with a category-colored icon square, title + status line, and a colored
 * offset shadow. Click opens the detail modal.
 */
function RichNodeComponent({ id, data, selected }: NodeProps<RichNodeType>) {
  const color = CATEGORY_COLOR[data.category];
  const status = getNodeStatus(data);
  const { deleteElements } = useReactFlow();
  const brand = isBrandIcon(data.icon);
  const fullBleed = isImageLogo(data.icon);
  const sub =
    data.statusChip ??
    (data.config.length > 0 ? data.config[0].value : undefined) ??
    data.category;

  return (
    <div
      data-canvas-card
      className={`group relative w-[150px] ${data.comingSoon ? "opacity-75" : ""}`}
    >
      {/* card */}
      <div
        className="relative flex h-[64px] items-center gap-2.5 rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] px-2.5"
        style={{
          boxShadow: `3px 3px 0 ${color}`,
          outline: selected ? `2px solid ${color}` : undefined,
          outlineOffset: 2,
        }}
      >
        {/* icon square — brand marks sit on white, lucide icons on the category color */}
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg border-2 border-[var(--hero-ink)]"
          style={brand ? { backgroundColor: "#fff" } : { backgroundColor: color, color: "#fff" }}
        >
          <NodeGlyph
            icon={data.icon}
            className={fullBleed ? "size-7 rounded-md object-cover" : "size-4"}
          />
        </span>

        <span className="min-w-0">
          <span className="block truncate font-heading text-[13px] font-extrabold leading-tight text-[var(--hero-ink)]">
            {data.title}
          </span>
          <span className="block truncate text-[10px] font-semibold text-[var(--hero-ink)]/55">
            {sub}
          </span>
        </span>

        {/* Status dot */}
        {status.tone !== "idle" ? (
          <span
            className="absolute right-1.5 top-1.5 size-2 rounded-full"
            style={{ background: STATUS_DOT_COLOR[status.tone] }}
            title={status.label}
          />
        ) : null}

        {data.dryRunSimulated ? (
          <span className="absolute -left-2 -top-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-amber)] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[var(--hero-ink)]">
            sim
          </span>
        ) : null}

        {/* Delete (floating badge, on hover) */}
        <button
          type="button"
          aria-label="Delete node"
          title="Delete node"
          className="nodrag absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full border-2 border-[var(--hero-ink)] bg-white text-[var(--hero-coral)] opacity-0 transition-opacity hover:bg-[var(--hero-coral)] hover:text-white group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            void deleteElements({ nodes: [{ id }] });
          }}
        >
          <Trash2 className="size-3" strokeWidth={2.5} />
        </button>

        {/* Ports (anchored to the card edges) */}
        {data.inputs.map((p, i) => (
          <PortHandle key={`in-${p.kind}-${i}`} port={p} side="in" index={i} count={data.inputs.length} />
        ))}
        {data.outputs.map((p, i) => (
          <PortHandle key={`out-${p.kind}-${i}`} port={p} side="out" index={i} count={data.outputs.length} />
        ))}
      </div>
    </div>
  );
}

export const RichNode = memo(RichNodeComponent);
