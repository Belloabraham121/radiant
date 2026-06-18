/** Platform chart components for generated apps — pure SVG, preview-safe. Template v1. */

export const RADIANT_CHARTS_VERSION = 1;

export const RADIANT_CHARTS_TSX = `/** Radiant platform charts — SVG area/sparkline, OHLCV-aware. Template v${RADIANT_CHARTS_VERSION}. */
"use client";

import { useMemo } from "react";

export type OhlcvCandle = {
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  timestamp_ms?: number;
  timestamp?: number;
  base_volume?: number;
};

const DEFAULT_ACCENT = "#7c3aed";

/** Normalize DeepBook indexer candles or loose objects into close prices. */
export function extractCloseSeries(candles: unknown[]): number[] {
  const out: number[] = [];
  for (const row of candles) {
    if (row == null) continue;
    if (Array.isArray(row)) {
      const close = row[4];
      if (typeof close === "number" && Number.isFinite(close)) out.push(close);
      continue;
    }
    if (typeof row === "object") {
      const c = row as Record<string, unknown>;
      const close = c.close ?? c.c;
      if (typeof close === "number" && Number.isFinite(close)) out.push(close);
    }
  }
  return out;
}

function buildPoints(data: number[], width: number, height: number, pad: number): string {
  if (data.length < 2) return "";
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  return data
    .map((value, index) => {
      const x = pad + (index / (data.length - 1)) * innerW;
      const y = pad + innerH - ((value - min) / range) * innerH;
      return \`\${index === 0 ? "M" : "L"}\${x.toFixed(1)},\${y.toFixed(1)}\`;
    })
    .join(" ");
}

function gridLines(width: number, height: number, pad: number, count: number): string {
  const lines: string[] = [];
  const innerH = height - pad * 2;
  for (let i = 0; i <= count; i += 1) {
    const y = pad + (i / count) * innerH;
    lines.push(\`M\${pad},\${y.toFixed(1)} L\${width - pad},\${y.toFixed(1)}\`);
  }
  return lines.join(" ");
}

export type AreaChartProps = {
  data: number[];
  accent?: string;
  label?: string;
  width?: number;
  height?: number;
  className?: string;
  emptyMessage?: string;
};

/** Area chart with grid + filled region — pass numeric series (e.g. close prices). */
export function AreaChart({
  data,
  accent = DEFAULT_ACCENT,
  label = "Chart",
  width = 560,
  height = 180,
  className = "w-full",
  emptyMessage = "Not enough data to plot yet.",
}: AreaChartProps) {
  const pad = 12;
  const series = useMemo(() => data.filter((v) => Number.isFinite(v)), [data]);
  const linePath = useMemo(
    () => (series.length >= 2 ? buildPoints(series, width, height, pad) : ""),
    [series, width, height],
  );
  const areaPath = useMemo(() => {
    if (!linePath) return "";
    const lastX = pad + ((series.length - 1) / (series.length - 1)) * (width - pad * 2);
    return \`\${linePath} L\${lastX.toFixed(1)},\${height - pad} L\${pad},\${height - pad} Z\`;
  }, [linePath, series.length, width, height, pad]);
  const grid = useMemo(() => gridLines(width, height, pad, 4), [width, height, pad]);

  if (series.length < 2) {
    return (
      <p className="text-sm text-gray-500" role="status">
        {emptyMessage}
      </p>
    );
  }

  const last = series[series.length - 1];
  const first = series[0];
  const change = first !== 0 ? ((last - first) / first) * 100 : 0;

  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
        <span className="text-sm font-bold tabular-nums" style={{ color: accent }}>
          {last.toPrecision(6)}
          <span className="ml-2 text-xs font-medium text-gray-500">
            ({change >= 0 ? "+" : ""}
            {change.toFixed(2)}%)
          </span>
        </span>
      </div>
      <svg
        viewBox={\`0 0 \${width} \${height}\`}
        className="h-44 w-full rounded-lg border border-gray-100 bg-gray-50/80"
        role="img"
        aria-label={label}
      >
        <path d={grid} fill="none" stroke="#e5e7eb" strokeWidth="1" />
        {areaPath ? (
          <path d={areaPath} fill={accent} fillOpacity="0.15" stroke="none" />
        ) : null}
        <path d={linePath} fill="none" stroke={accent} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export type OhlcvAreaChartProps = {
  candles: unknown[];
  accent?: string;
  label?: string;
  className?: string;
  emptyMessage?: string;
};

/** Area chart wired for deepbookOhlcv().candles — handles normalized indexer rows. */
export function OhlcvAreaChart({
  candles,
  accent = DEFAULT_ACCENT,
  label = "Price trend",
  className = "w-full",
  emptyMessage = "Not enough candle data for this pool yet — try another pool or interval.",
}: OhlcvAreaChartProps) {
  const data = useMemo(() => extractCloseSeries(candles), [candles]);
  return (
    <AreaChart
      data={data}
      accent={accent}
      label={label}
      className={className}
      emptyMessage={emptyMessage}
    />
  );
}

/** Compact sparkline for stat rows. */
export function Sparkline({
  data,
  accent = DEFAULT_ACCENT,
  width = 280,
  height = 64,
  className = "h-16 w-full max-w-sm",
  emptyMessage = "Not enough data yet.",
}: AreaChartProps) {
  const pad = 4;
  const series = useMemo(() => data.filter((v) => Number.isFinite(v)), [data]);
  const linePath = useMemo(
    () => (series.length >= 2 ? buildPoints(series, width, height, pad) : ""),
    [series, width, height],
  );

  if (!linePath) {
    return (
      <p className="text-sm text-gray-500" role="status">
        {emptyMessage}
      </p>
    );
  }

  return (
    <svg viewBox={\`0 0 \${width} \${height}\`} className={className} aria-hidden="true">
      <path
        d={linePath}
        fill="none"
        stroke={accent}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function OhlcvSparkline(props: OhlcvAreaChartProps) {
  const data = useMemo(() => extractCloseSeries(props.candles), [props.candles]);
  return (
    <Sparkline
      data={data}
      accent={props.accent}
      className={props.className}
      emptyMessage={props.emptyMessage}
    />
  );
}
`;
