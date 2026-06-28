"use client";

import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

/**
 * Edge with a dot that travels along the path (SVG animateMotion) — used in
 * Dry Run / Live to show data flowing through the graph.
 * Pattern: https://reactflow.dev/examples/edges/animating-edges
 */
export function AnimatedSVGEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      <circle r="4.5" fill="var(--hero-coral)" stroke="var(--hero-ink)" strokeWidth="1.5">
        <animateMotion dur="2.2s" repeatCount="indefinite" path={edgePath} />
      </circle>
    </>
  );
}
