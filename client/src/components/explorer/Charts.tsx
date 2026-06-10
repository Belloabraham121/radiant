"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { fmt } from "@/lib/explorer-data";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const W = 600;
const H = 200;
const PAD = 8;

function points(data: number[]): [number, number][] {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = Math.max(1, max - min);
  return data.map((v, i) => [
    PAD + (i * (W - PAD * 2)) / (data.length - 1),
    H - PAD - ((v - min) / range) * (H - PAD * 2),
  ]);
}

function dayLabel(index: number, total: number): string {
  const daysAgo = total - 1 - index;
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return `${daysAgo} days ago`;
}

type ChartProps = {
  data: number[];
  accent: string;
  label: string;
  unit?: string;
};

type HoverTipProps = {
  accent: string;
  value: number;
  unit: string;
  day: string;
  xPct: number;
  yPct: number;
};

function HoverTip({ accent, value, unit, day, xPct, yPct }: HoverTipProps) {
  const clampedX = Math.min(Math.max(xPct, 8), 92);
  const above = yPct > 28;
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-xl border-2 border-[var(--hero-ink)] bg-white px-3 py-2 text-center shadow-[3px_3px_0_var(--hero-ink)]"
      style={{
        left: `${clampedX}%`,
        top: above ? `${yPct - 14}%` : `${yPct + 6}%`,
      }}
    >
      <p className="font-heading text-sm font-extrabold tabular-nums" style={{ color: accent }}>
        {fmt(value)}
        {unit}
      </p>
      <p className="text-[11px] font-bold text-[var(--hero-ink)]/45">{day}</p>
    </div>
  );
}

/** Flat-styled SVG area chart — hover to scrub values along the line. */
export function AreaChart({ data, accent, label, unit = "" }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ index: number; xPct: number; yPct: number } | null>(
    null,
  );

  const pts = useMemo(() => points(data), [data]);
  const line = "M" + pts.map(([x, y]) => `${x},${y}`).join(" L");
  const area = `${line} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`;
  const activeIndex = hover?.index ?? data.length - 1;
  const activeValue = data[activeIndex];

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const tl = gsap.timeline({
        scrollTrigger: { trigger: ref.current, start: "top 88%" },
      });
      tl.fromTo(
        "[data-line]",
        { strokeDashoffset: 1 },
        { strokeDashoffset: 0, duration: 1.8, ease: "power2.inOut" },
        0,
      )
        .from("[data-area]", { opacity: 0, duration: 1.2 }, 0.5)
        .from(
          "[data-dot]",
          { scale: 0, transformOrigin: "center", duration: 0.5, ease: "back.out(3)" },
          1.5,
        );
    },
    { scope: ref },
  );

  const handleMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;
      const chartX = PAD + relX * (W - PAD * 2);
      const index = Math.round(
        ((chartX - PAD) / (W - PAD * 2)) * (data.length - 1),
      );
      const clamped = Math.max(0, Math.min(data.length - 1, index));
      const [px, py] = pts[clamped];
      setHover({
        index: clamped,
        xPct: (px / W) * 100,
        yPct: (py / H) * 100,
      });
    },
    [data.length, pts],
  );

  return (
    <div
      ref={ref}
      className="rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-6 shadow-[6px_6px_0_var(--hero-ink)]"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-sm font-bold uppercase tracking-[0.15em] text-[var(--hero-ink)]/45">
          {label}
        </span>
        <span
          className="shrink-0 rounded-full px-3 py-1 text-sm font-extrabold text-white transition-colors"
          style={{ backgroundColor: accent }}
        >
          {fmt(activeValue)}
          {unit} · {dayLabel(activeIndex, data.length)}
        </span>
      </div>

      <div className="relative">
        {hover && (
          <HoverTip
            accent={accent}
            value={data[hover.index]}
            unit={unit}
            day={dayLabel(hover.index, data.length)}
            xPct={hover.xPct}
            yPct={hover.yPct}
          />
        )}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full cursor-crosshair touch-none"
          role="img"
          aria-label={label}
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
        >
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={PAD}
              x2={W - PAD}
              y1={H * f}
              y2={H * f}
              stroke="#1b1610"
              strokeOpacity="0.08"
              strokeDasharray="4 6"
            />
          ))}
          <path data-area d={area} fill={accent} fillOpacity="0.16" />
          <path
            data-line
            d={line}
            fill="none"
            stroke={accent}
            strokeWidth="4"
            strokeLinejoin="round"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
          />

          {hover && (
            <>
              <line
                x1={pts[hover.index][0]}
                x2={pts[hover.index][0]}
                y1={PAD}
                y2={H - PAD}
                stroke={accent}
                strokeOpacity="0.35"
                strokeWidth="2"
                strokeDasharray="4 4"
              />
              <circle
                cx={pts[hover.index][0]}
                cy={pts[hover.index][1]}
                r="8"
                fill={accent}
                stroke="#fffdf7"
                strokeWidth="3"
              />
            </>
          )}

          {!hover && (
            <circle
              data-dot
              cx={pts[pts.length - 1][0]}
              cy={pts[pts.length - 1][1]}
              r="7"
              fill={accent}
              stroke="#fffdf7"
              strokeWidth="3"
            />
          )}

          {/* invisible hit layer for easier scrubbing */}
          <rect
            x={PAD}
            y={PAD}
            width={W - PAD * 2}
            height={H - PAD * 2}
            fill="transparent"
          />
        </svg>
      </div>

      <div className="mt-2 flex justify-between text-xs font-bold text-[var(--hero-ink)]/35">
        <span>30 days ago</span>
        <span>{hover ? "hover to explore" : "today"}</span>
      </div>
    </div>
  );
}

/** Flat-styled SVG bar chart — hover each bar to see its value. */
export function BarChart({ data, accent, label, unit = "" }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverBar, setHoverBar] = useState<number | null>(null);

  const bars = data.filter((_, i) => i % 2 === 0);
  const barIndices = bars.map((_, i) => i * 2);
  const max = Math.max(...bars);
  const bw = (W - PAD * 2) / bars.length;
  const activeBar = hoverBar ?? bars.length - 1;
  const activeValue = bars[activeBar];
  const activeDataIndex = barIndices[activeBar];

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from("[data-bar]", {
        scaleY: 0,
        transformOrigin: "bottom",
        duration: 0.7,
        stagger: 0.05,
        ease: "back.out(1.6)",
        scrollTrigger: { trigger: ref.current, start: "top 88%" },
      });
    },
    { scope: ref },
  );

  const barGeom = bars.map((v, i) => {
    const h = Math.max(6, (v / max) * (H - PAD * 2));
    const x = PAD + i * bw + bw * 0.18;
    const y = H - PAD - h;
    const w = bw * 0.64;
    return { v, h, x, y, w, cx: x + w / 2 };
  });

  const tip = hoverBar !== null ? barGeom[hoverBar] : null;

  return (
    <div
      ref={ref}
      className="rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-6 shadow-[6px_6px_0_var(--hero-ink)]"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-sm font-bold uppercase tracking-[0.15em] text-[var(--hero-ink)]/45">
          {label}
        </span>
        <span
          className="shrink-0 rounded-full px-3 py-1 text-sm font-extrabold text-white transition-colors"
          style={{ backgroundColor: accent }}
        >
          {fmt(activeValue)}
          {unit} · {dayLabel(activeDataIndex, data.length)}
        </span>
      </div>

      <div className="relative">
        {tip && hoverBar !== null && (
          <HoverTip
            accent={accent}
            value={bars[hoverBar]}
            unit={unit}
            day={dayLabel(barIndices[hoverBar], data.length)}
            xPct={(tip.cx / W) * 100}
            yPct={(tip.y / H) * 100}
          />
        )}

        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
          {barGeom.map(({ h, x, y, w }, i) => {
            const isHover = hoverBar === i;
            const isLast = i === bars.length - 1;
            const colX = PAD + i * bw;
            return (
              <g key={i}>
                <rect
                  data-bar
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx={6}
                  fill={accent}
                  fillOpacity={isHover || (isLast && hoverBar === null) ? 1 : 0.45}
                  className="pointer-events-none transition-[fill-opacity] duration-150"
                />
                <rect
                  x={colX}
                  y={PAD}
                  width={bw}
                  height={H - PAD * 2}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverBar(i)}
                  onMouseLeave={() => setHoverBar(null)}
                />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-2 flex justify-between text-xs font-bold text-[var(--hero-ink)]/35">
        <span>30 days ago</span>
        <span>{hoverBar !== null ? "hover to explore" : "today"}</span>
      </div>
    </div>
  );
}

/** Tiny inline sparkline for agent cards. */
export function Sparkline({ data, accent }: { data: number[]; accent: string }) {
  const w = 120;
  const h = 36;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = Math.max(1, max - min);
  const pts = data
    .map((v, i) => `${(i * w) / (data.length - 1)},${h - 3 - ((v - min) / range) * (h - 6)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke={accent}
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
