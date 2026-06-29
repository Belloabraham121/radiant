"use client";

import { memo, useEffect, useRef } from "react";
import {
  Handle,
  NodeResizer,
  Position,
  useReactFlow,
  type NodeProps,
} from "@xyflow/react";
import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type UTCTimestamp,
} from "lightweight-charts";
import { Trash2 } from "lucide-react";
import { CATEGORY_COLOR, PORT_COLOR, type RichNode as RichNodeType } from "./canvas-nodes";
import { NodeGlyph } from "./node-glyph";

type ChartType = "candlestick" | "line" | "area" | "bars";

const CHART_TYPES: Array<{ id: ChartType; label: string }> = [
  { id: "candlestick", label: "Candles" },
  { id: "line", label: "Line" },
  { id: "area", label: "Area" },
  { id: "bars", label: "Bars" },
];

const UP = "#00c478";
const DOWN = "#ff5d46";
const ACCENT = "#3865ff";

type Bar = { time: UTCTimestamp; open: number; high: number; low: number; close: number };

/** Deterministic-ish mock OHLC history (prototype — no live feed wired yet). */
function genBars(count: number): Bar[] {
  const now = Math.floor(Date.now() / 1000);
  const step = 3600;
  let price = 94000;
  const bars: Bar[] = [];
  for (let i = count; i > 0; i--) {
    const time = (now - i * step) as UTCTimestamp;
    const open = price;
    const close = Math.max(1000, open + (Math.random() - 0.5) * 900);
    const high = Math.max(open, close) + Math.random() * 300;
    const low = Math.min(open, close) - Math.random() * 300;
    bars.push({ time, open, high, low, close });
    price = close;
  }
  return bars;
}

function toSeriesData(bars: Bar[], type: ChartType) {
  if (type === "line" || type === "area") {
    return bars.map((b) => ({ time: b.time, value: b.close }));
  }
  return bars;
}

function addSeries(chart: IChartApi, type: ChartType): ISeriesApi<SeriesType> {
  if (type === "line") {
    return chart.addSeries(LineSeries, { color: ACCENT, lineWidth: 2 });
  }
  if (type === "area") {
    return chart.addSeries(AreaSeries, {
      lineColor: ACCENT,
      topColor: "rgba(56,101,255,0.35)",
      bottomColor: "rgba(56,101,255,0.02)",
      lineWidth: 2,
    });
  }
  if (type === "bars") {
    return chart.addSeries(BarSeries, { upColor: UP, downColor: DOWN });
  }
  return chart.addSeries(CandlestickSeries, {
    upColor: UP,
    downColor: DOWN,
    borderUpColor: UP,
    borderDownColor: DOWN,
    wickUpColor: UP,
    wickDownColor: DOWN,
  });
}

function PriceChartNodeComponent({ id, data, selected }: NodeProps<RichNodeType>) {
  const color = CATEGORY_COLOR[data.category];
  const chartType: ChartType = (data.chartType as ChartType) ?? "candlestick";
  const { deleteElements, updateNodeData } = useReactFlow();

  const mountRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const barsRef = useRef<Bar[]>([]);
  const tickRef = useRef(0);

  const pair =
    (typeof data.values?.pair === "string" && data.values.pair) ||
    data.config.find((c) => c.label === "pair")?.value ||
    "BTC/USD";

  // Create the chart once; drive resize + a mock real-time tick.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const chart = createChart(mount, {
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "rgba(27,22,16,0.55)",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(27,22,16,0.06)" },
        horzLines: { color: "rgba(27,22,16,0.06)" },
      },
      rightPriceScale: { borderColor: "rgba(27,22,16,0.12)" },
      timeScale: { borderColor: "rgba(27,22,16,0.12)", timeVisible: true },
      autoSize: false,
      handleScale: true,
      handleScroll: true,
    });
    chartRef.current = chart;
    barsRef.current = genBars(80);

    const resize = () => {
      chart.resize(mount.clientWidth, mount.clientHeight);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // Mock live updates: mostly update the forming candle; sometimes add a bar.
    const interval = window.setInterval(() => {
      const series = seriesRef.current;
      const bars = barsRef.current;
      if (!series || bars.length === 0) return;
      tickRef.current += 1;
      const last = bars[bars.length - 1];

      if (tickRef.current % 6 === 0) {
        const time = (last.time + 3600) as UTCTimestamp;
        const open = last.close;
        const close = Math.max(1000, open + (Math.random() - 0.5) * 600);
        const next: Bar = {
          time,
          open,
          close,
          high: Math.max(open, close) + Math.random() * 200,
          low: Math.min(open, close) - Math.random() * 200,
        };
        bars.push(next);
      } else {
        const close = Math.max(1000, last.close + (Math.random() - 0.5) * 500);
        last.close = close;
        last.high = Math.max(last.high, close);
        last.low = Math.min(last.low, close);
      }
      const updated = bars[bars.length - 1];
      const t = (data.chartType as ChartType) ?? "candlestick";
      series.update(t === "line" || t === "area" ? { time: updated.time, value: updated.close } : updated);
    }, 1400);

    return () => {
      window.clearInterval(interval);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re)build the series whenever the chart type changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }
    const series = addSeries(chart, chartType);
    series.setData(toSeriesData(barsRef.current, chartType) as never);
    chart.timeScale().fitContent();
    seriesRef.current = series;
  }, [chartType]);

  return (
    <div
      data-canvas-card
      className="relative flex h-full w-full flex-col rounded-2xl border-2 border-[var(--hero-ink)] bg-white text-[var(--hero-ink)]"
      style={{ boxShadow: `inset 6px 0 0 ${color}` }}
    >
      <NodeResizer
        minWidth={300}
        minHeight={220}
        isVisible={selected}
        color="var(--hero-ink)"
        handleStyle={{ width: 10, height: 10, borderRadius: 3 }}
        lineStyle={{ borderColor: "var(--hero-ink)" }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-[14px] border-b-2 border-[var(--hero-ink)] bg-white px-3 py-2 pl-4">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg border-2 border-[var(--hero-ink)] bg-white">
          <NodeGlyph icon={data.icon} className="size-4 text-[var(--hero-ink)]" />
        </span>
        <span className="font-heading text-sm font-extrabold">{data.title}</span>
        <span className="rounded-md border-2 border-[var(--hero-ink)]/15 bg-[var(--hero-bg)] px-1.5 py-0.5 font-mono text-[10px] font-bold">
          {pair}
        </span>

        {/* Chart-type switcher */}
        <div className="nodrag ml-auto flex items-center gap-0.5 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] p-0.5">
          {CHART_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                updateNodeData(id, { chartType: t.id });
              }}
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors ${
                chartType === t.id
                  ? "bg-[var(--hero-ink)] text-[var(--hero-bg)]"
                  : "text-[var(--hero-ink)]/55 hover:text-[var(--hero-ink)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-label="Delete node"
          title="Delete node"
          className="nodrag flex size-5 shrink-0 items-center justify-center rounded text-[var(--hero-ink)]/30 transition-colors hover:bg-[var(--hero-coral)] hover:text-white"
          onClick={(e) => {
            e.stopPropagation();
            void deleteElements({ nodes: [{ id }] });
          }}
        >
          <Trash2 className="size-3.5" strokeWidth={2.5} />
        </button>
      </div>

      {/* Chart body */}
      <div ref={mountRef} className="nodrag nowheel min-h-0 flex-1 overflow-hidden rounded-b-2xl" />

      {/* Ports */}
      {data.inputs.map((p, i) => (
        <Handle
          key={`in-${p.kind}-${i}`}
          type="target"
          position={Position.Left}
          id={`in-${p.kind}`}
          style={{
            top: `${((i + 1) / (data.inputs.length + 1)) * 100}%`,
            width: 12,
            height: 12,
            background: PORT_COLOR[p.kind],
            border: "2px solid var(--hero-ink)",
            borderRadius: p.kind === "data" ? "999px" : "3px",
          }}
        />
      ))}
      {data.outputs.map((p, i) => (
        <Handle
          key={`out-${p.kind}-${i}`}
          type="source"
          position={Position.Right}
          id={`out-${p.kind}`}
          style={{
            top: `${((i + 1) / (data.outputs.length + 1)) * 100}%`,
            width: 12,
            height: 12,
            background: PORT_COLOR[p.kind],
            border: "2px solid var(--hero-ink)",
            borderRadius: p.kind === "data" ? "999px" : "3px",
          }}
        />
      ))}
    </div>
  );
}

export const PriceChartNode = memo(PriceChartNodeComponent);
