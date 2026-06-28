import type { Edge, Node } from "@xyflow/react";

/** Canvas modes — drives board chrome + edge animation. */
export type CanvasMode = "build" | "dry" | "live";

/** Node category → hero color (instant board legibility). */
export type NodeCategory =
  | "control"
  | "data"
  | "logic"
  | "action"
  | "ui"
  | "ai";

export const CATEGORY_COLOR: Record<NodeCategory, string> = {
  control: "var(--hero-ink)",
  data: "var(--hero-blue)",
  logic: "var(--hero-violet)",
  action: "var(--hero-coral)",
  ui: "var(--hero-mint)",
  ai: "var(--hero-amber)",
};

/** Typed ports — self-documenting wires (shape + color per kind). */
export type PortKind = "trigger" | "signal" | "market" | "order_intent" | "data";

export const PORT_COLOR: Record<PortKind, string> = {
  trigger: "var(--hero-coral)",
  market: "var(--hero-blue)",
  data: "var(--hero-ink)",
  signal: "var(--hero-violet)",
  order_intent: "var(--hero-amber)",
};

export const PORT_LABEL: Record<PortKind, string> = {
  trigger: "trigger",
  market: "market",
  data: "data",
  signal: "signal",
  order_intent: "intent",
};

export type CanvasPort = { kind: PortKind; label?: string };

/** Lightweight preview kinds rendered as CSS mockups in Phase 0 (no live data). */
export type PreviewKind =
  | "bars"
  | "book"
  | "result"
  | "order"
  | "positions"
  | "copytrade"
  | "none";

export type ConfigValue = string | number | boolean;

/** Show a field only when another field's value is one of these. */
export type ConfigFieldVisibility = { key: string; in: string[] };

type ConfigFieldCommon = {
  key: string;
  label: string;
  required?: boolean;
  showWhen?: ConfigFieldVisibility;
};

/** Typed config field schema — drives the editable panel inside a rich node. */
export type ConfigField =
  | (ConfigFieldCommon & {
      kind: "select";
      options: Array<{ value: string; label: string }>;
      default: string;
    })
  | (ConfigFieldCommon & {
      kind: "number";
      default?: number;
      min?: number;
      max?: number;
      step?: number;
      suffix?: string;
    })
  | (ConfigFieldCommon & { kind: "text"; default?: string; placeholder?: string })
  | (ConfigFieldCommon & { kind: "toggle"; default?: boolean })
  | (ConfigFieldCommon & { kind: "market"; placeholder?: string });

export function defaultConfigValues(fields: ConfigField[]): Record<string, ConfigValue> {
  const values: Record<string, ConfigValue> = {};
  for (const f of fields) {
    if (f.kind === "select") values[f.key] = f.default;
    else if (f.kind === "number") values[f.key] = f.default ?? 0;
    else if (f.kind === "toggle") values[f.key] = f.default ?? false;
    else if (f.kind === "text") values[f.key] = f.default ?? "";
    else values[f.key] = ""; // market
  }
  return values;
}

export function isConfigFieldVisible(
  field: ConfigField,
  values: Record<string, ConfigValue>,
): boolean {
  if (!field.showWhen) return true;
  return field.showWhen.in.includes(String(values[field.showWhen.key]));
}

export type RichNodeData = {
  category: NodeCategory;
  /** lucide-react icon name resolved in RichNode. */
  icon: string;
  title: string;
  statusChip?: string;
  preview: PreviewKind;
  config: Array<{ label: string; value: string }>;
  /** Editable config schema (configurable nodes); static `config` chips otherwise. */
  fields?: ConfigField[];
  values?: Record<string, ConfigValue>;
  inputs: CanvasPort[];
  outputs: CanvasPort[];
  /** Action nodes show a "simulated"/"live" ribbon in Dry/Live mode. */
  isAction?: boolean;
  /** Not yet executable (e.g. Limitless place/cancel) — shows a "soon" badge. */
  comingSoon?: boolean;
  /** Price Chart node only — selected chart style. */
  chartType?: "candlestick" | "line" | "area" | "bars";
  [key: string]: unknown;
};

/** Node type is a string ("rich" compact card, or "chart" expanded chart). */
export type RichNode = Node<RichNodeData>;

export type NodeStatusTone = "ready" | "warn" | "soon" | "idle";

/** Derive a node's status (used for the card dot + the detail dialog chip). */
export function getNodeStatus(data: RichNodeData): { label: string; tone: NodeStatusTone } {
  if (data.comingSoon) {
    return { label: "soon", tone: "soon" };
  }
  if (data.fields && data.values) {
    const values = data.values;
    const missing = data.fields
      .filter((f) => isConfigFieldVisible(f, values))
      .some((f) => f.required && (values[f.key] === "" || values[f.key] === undefined));
    if (missing) return { label: "needs config", tone: "warn" };
    return { label: data.statusChip ?? "ready", tone: "ready" };
  }
  if (data.statusChip) return { label: data.statusChip, tone: "ready" };
  return { label: "", tone: "idle" };
}

export const STATUS_DOT_COLOR: Record<NodeStatusTone, string> = {
  ready: "var(--hero-mint)",
  warn: "var(--hero-amber)",
  soon: "var(--hero-amber)",
  idle: "rgba(27,22,16,0.3)",
};

/** Sample strategy graph for the Phase 0 prototype (static, no backend). */
export const SAMPLE_NODES: RichNode[] = [
  {
    id: "start",
    type: "rich",
    position: { x: -40, y: 220 },
    data: {
      category: "control",
      icon: "Play",
      title: "Start",
      statusChip: "idle",
      preview: "none",
      config: [{ label: "entry", value: "manual" }],
      inputs: [],
      outputs: [{ kind: "trigger" }],
    },
  },
  {
    id: "price-chart",
    type: "chart",
    position: { x: 300, y: 40 },
    width: 400,
    height: 280,
    data: {
      category: "data",
      icon: "LineChart",
      title: "Price Chart",
      statusChip: "live",
      preview: "none",
      chartType: "candlestick",
      config: [{ label: "pair", value: "BTC/USD" }],
      inputs: [{ kind: "signal" }, { kind: "data" }],
      outputs: [{ kind: "data" }],
    },
  },
  {
    id: "pm-feed",
    type: "rich",
    position: { x: 300, y: 380 },
    data: {
      category: "data",
      icon: "polymarket",
      title: "Polymarket Feed",
      statusChip: "live",
      preview: "book",
      config: [{ label: "market", value: "BTC > 100k" }],
      inputs: [],
      outputs: [
        { kind: "market" },
        { kind: "data" },
      ],
    },
  },
  {
    id: "if",
    type: "rich",
    position: { x: 700, y: 220 },
    data: {
      category: "logic",
      icon: "GitBranch",
      title: "IF — drop & odds",
      statusChip: "armed",
      preview: "result",
      config: [{ label: "when", value: "BTC −5% & mid < 0.40" }],
      inputs: [{ kind: "trigger" }, { kind: "data" }],
      outputs: [{ kind: "trigger" }],
    },
  },
  {
    id: "approve",
    type: "rich",
    position: { x: 1040, y: 220 },
    data: {
      category: "control",
      icon: "ShieldCheck",
      title: "Approve",
      statusChip: "pending",
      preview: "none",
      config: [{ label: "gate", value: "human confirm" }],
      inputs: [{ kind: "trigger" }, { kind: "order_intent" }],
      outputs: [{ kind: "trigger" }],
    },
  },
  {
    id: "place-order",
    type: "rich",
    position: { x: 1380, y: 220 },
    data: {
      category: "action",
      icon: "Coins",
      title: "Place Order",
      statusChip: "ready",
      preview: "order",
      config: [
        { label: "side", value: "BUY" },
        { label: "size", value: "$50" },
      ],
      inputs: [{ kind: "trigger" }, { kind: "market" }],
      outputs: [{ kind: "data" }],
      isAction: true,
    },
  },
];

export const SAMPLE_EDGES: Edge[] = [
  { id: "e-start-if", source: "start", sourceHandle: "out-trigger", target: "if", targetHandle: "in-trigger" },
  { id: "e-chart-if", source: "price-chart", sourceHandle: "out-data", target: "if", targetHandle: "in-data" },
  { id: "e-pm-if", source: "pm-feed", sourceHandle: "out-data", target: "if", targetHandle: "in-data" },
  { id: "e-if-approve", source: "if", sourceHandle: "out-trigger", target: "approve", targetHandle: "in-trigger" },
  { id: "e-approve-order", source: "approve", sourceHandle: "out-trigger", target: "place-order", targetHandle: "in-trigger" },
  { id: "e-pm-order", source: "pm-feed", sourceHandle: "out-market", target: "place-order", targetHandle: "in-market" },
];
