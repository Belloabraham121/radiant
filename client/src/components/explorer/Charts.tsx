"use client";

import { useRef } from "react";
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

type ChartProps = {
  data: number[];
  accent: string;
  label: string;
  unit?: string;
};

/** Flat-styled SVG area chart whose line draws itself in on scroll. */
export function AreaChart({ data, accent, label, unit = "" }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);

  const pts = points(data);
  const line = "M" + pts.map(([x, y]) => `${x},${y}`).join(" L");
  const area = `${line} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`;
  const last = data[data.length - 1];

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

  return (
    <div
      ref={ref}
      className="rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-6 shadow-[6px_6px_0_var(--hero-ink)]"
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-bold uppercase tracking-[0.15em] text-[var(--hero-ink)]/45">
          {label}
        </span>
        <span
          className="rounded-full px-3 py-1 text-sm font-extrabold text-white"
          style={{ backgroundColor: accent }}
        >
          {fmt(last)}
          {unit} today
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
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
        <circle
          data-dot
          cx={pts[pts.length - 1][0]}
          cy={pts[pts.length - 1][1]}
          r="7"
          fill={accent}
          stroke="#fffdf7"
          strokeWidth="3"
        />
      </svg>
      <div className="mt-2 flex justify-between text-xs font-bold text-[var(--hero-ink)]/35">
        <span>30 days ago</span>
        <span>today</span>
      </div>
    </div>
  );
}

/** Flat-styled SVG bar chart whose bars grow in with a stagger. */
export function BarChart({ data, accent, label, unit = "" }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const bars = data.filter((_, i) => i % 2 === 0); // 15 bars from 30 points
  const max = Math.max(...bars);
  const bw = (W - PAD * 2) / bars.length;
  const last = data[data.length - 1];

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

  return (
    <div
      ref={ref}
      className="rounded-3xl border-2 border-[var(--hero-ink)] bg-white p-6 shadow-[6px_6px_0_var(--hero-ink)]"
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-bold uppercase tracking-[0.15em] text-[var(--hero-ink)]/45">
          {label}
        </span>
        <span
          className="rounded-full px-3 py-1 text-sm font-extrabold text-white"
          style={{ backgroundColor: accent }}
        >
          {fmt(last)}
          {unit} today
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
        {bars.map((v, i) => {
          const h = Math.max(6, (v / max) * (H - PAD * 2));
          return (
            <rect
              key={i}
              data-bar
              x={PAD + i * bw + bw * 0.18}
              y={H - PAD - h}
              width={bw * 0.64}
              height={h}
              rx={6}
              fill={accent}
              fillOpacity={i === bars.length - 1 ? 1 : 0.45}
            />
          );
        })}
      </svg>
      <div className="mt-2 flex justify-between text-xs font-bold text-[var(--hero-ink)]/35">
        <span>30 days ago</span>
        <span>today</span>
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
