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
import { NodeGlyph, isImageLogo } from "./node-glyph";

/** Fixed shape height so ports anchor to the capsule, not the name below it. */
const SHAPE_H = 56;

/**
 * Left (input) ports follow the curved left edge (semicircle of radius
 * SHAPE_H/2); right (output) ports stay on a straight vertical line.
 */
function portPosition(side: "in" | "out", index: number, count: number) {
  if (side === "out") {
    return { top: ((index + 1) / (count + 1)) * SHAPE_H };
  }
  const r = SHAPE_H / 2;
  if (count <= 1) {
    return { left: 0, top: r };
  }
  // Spread along the arc by angle; cap so ports don't reach the corners.
  const spread = Math.min(1.05, (count - 1) * 0.45);
  const a = -spread + (index / (count - 1)) * (2 * spread);
  return { left: r - r * Math.cos(a), top: r + r * Math.sin(a) };
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
        ...portPosition(side, index, count),
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
 * Compact node — a capsule-ish tab (left fully rounded, right gently rounded)
 * holding the icon, with the node name underneath. Click opens the detail modal.
 */
function RichNodeComponent({ id, data, selected }: NodeProps<RichNodeType>) {
  const color = CATEGORY_COLOR[data.category];
  const status = getNodeStatus(data);
  const { deleteElements } = useReactFlow();
  const fullBleed = isImageLogo(data.icon);

  return (
    <div
      data-canvas-card
      className={`group flex w-24 flex-col items-center ${data.comingSoon ? "opacity-75" : ""}`}
    >
      {/* Capsule shape */}
      <div
        className="relative flex h-14 w-full items-center justify-center rounded-l-full rounded-r-xl border-2 border-[var(--hero-ink)] bg-white"
        style={{
          outline: selected ? `2px solid ${color}` : undefined,
          outlineOffset: 2,
        }}
      >
        <span
          className="flex size-8 items-center justify-center"
          style={fullBleed ? undefined : { color }}
        >
          <NodeGlyph
            icon={data.icon}
            className={fullBleed ? "size-7 rounded-md object-cover" : "size-6"}
          />
        </span>

        {/* Status dot */}
        {status.tone !== "idle" ? (
          <span
            className="absolute right-2 top-2 size-2 rounded-full"
            style={{ background: STATUS_DOT_COLOR[status.tone] }}
            title={status.label}
          />
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

        {/* Ports (anchored to the capsule) */}
        {data.inputs.map((p, i) => (
          <PortHandle key={`in-${p.kind}-${i}`} port={p} side="in" index={i} count={data.inputs.length} />
        ))}
        {data.outputs.map((p, i) => (
          <PortHandle key={`out-${p.kind}-${i}`} port={p} side="out" index={i} count={data.outputs.length} />
        ))}
      </div>

      {/* Name under the node */}
      <span className="mt-1.5 line-clamp-2 w-[6.5rem] text-center font-heading text-[11px] font-bold leading-tight text-[var(--hero-ink)]">
        {data.title}
      </span>
    </div>
  );
}

export const RichNode = memo(RichNodeComponent);
