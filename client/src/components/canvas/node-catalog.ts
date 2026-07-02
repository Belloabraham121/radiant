import {
  ArrowLeftRight,
  Ban,
  BarChart3,
  Bell,
  BookOpen,
  Brain,
  Clock,
  Coins,
  Copy,
  FlaskConical,
  Gauge,
  GitBranch,
  LayoutDashboard,
  LineChart,
  MousePointerClick,
  Play,
  Radio,
  Route,
  Scale,
  Send,
  ShieldCheck,
  Square,
  Table,
  Timer,
  Type,
  Wallet,
  Waves,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import {
  defaultConfigValues,
  type CanvasPort,
  type ConfigField,
  type NodeCategory,
  type PreviewKind,
  type RichNodeData,
} from "./canvas-nodes";
import { NODE_PORT_DOCS, type PortDocs } from "./node-port-docs";

/** Shared icon registry (RichNode + palette resolve icons from here by key). */
export const NODE_ICONS: Record<string, LucideIcon> = {
  Play,
  ShieldCheck,
  Square,
  LineChart,
  Radio,
  BookOpen,
  Wallet,
  Waves,
  GitBranch,
  Scale,
  Gauge,
  FlaskConical,
  Coins,
  ArrowLeftRight,
  Waypoints,
  Route,
  Send,
  Copy,
  MousePointerClick,
  Table,
  Type,
  BarChart3,
  LayoutDashboard,
  Brain,
  Clock,
  Bell,
  Timer,
  Ban,
};

export type NodeCatalogEntry = {
  slug: string;
  title: string;
  /** Display section in the palette. */
  group: string;
  /** Color bucket (hero palette). */
  category: NodeCategory;
  /** lucide icon key, or a brand-logo key ("polymarket" | "lifi"). */
  icon: string;
  description: string;
  inputs: CanvasPort[];
  outputs: CanvasPort[];
  config?: Array<{ label: string; value: string }>;
  /** Editable config schema (configurable nodes). */
  fields?: ConfigField[];
  preview?: PreviewKind;
  /** Not yet executable — palette + node show a "soon" badge. */
  comingSoon?: boolean;
  /** Board node renderer; defaults to the compact "rich" card. */
  nodeType?: "rich" | "chart";
  /** Port documentation for the node inspector. */
  portDocs?: PortDocs;
};

export const POLYMARKET_ORDER_FIELDS: ConfigField[] = [
  {
    kind: "select",
    key: "operation",
    label: "Operation",
    required: true,
    default: "place_limit",
    options: [
      { value: "place_limit", label: "Place Limit" },
      { value: "place_market", label: "Place Market" },
      { value: "cancel", label: "Cancel" },
    ],
  },
  {
    kind: "select",
    key: "outcome",
    label: "Outcome",
    required: true,
    default: "yes",
    showWhen: { key: "operation", in: ["place_limit", "place_market"] },
    options: [
      { value: "yes", label: "YES" },
      { value: "no", label: "NO" },
    ],
  },
  {
    kind: "select",
    key: "side",
    label: "Side",
    required: true,
    default: "buy",
    showWhen: { key: "operation", in: ["place_limit", "place_market"] },
    options: [
      { value: "buy", label: "BUY" },
      { value: "sell", label: "SELL" },
    ],
  },
  {
    kind: "number",
    key: "size",
    label: "Size",
    required: true,
    default: 50,
    min: 0,
    suffix: "USDC",
    showWhen: { key: "operation", in: ["place_limit", "place_market"] },
  },
  {
    kind: "number",
    key: "price",
    label: "Price",
    required: true,
    default: 0.39,
    min: 0,
    max: 1,
    step: 0.01,
    showWhen: { key: "operation", in: ["place_limit"] },
  },
  {
    kind: "select",
    key: "tif",
    label: "Time in force",
    default: "gtc",
    showWhen: { key: "operation", in: ["place_limit"] },
    options: [
      { value: "gtc", label: "GTC" },
      { value: "gtd", label: "GTD" },
      { value: "fok", label: "FOK" },
    ],
  },
  {
    kind: "text",
    key: "order_id",
    label: "Order",
    required: true,
    placeholder: "order id or filter",
    showWhen: { key: "operation", in: ["cancel"] },
  },
];

const LIFI_CORRIDOR_FIELDS: ConfigField[] = [
  { kind: "text", key: "from_chain_id", label: "From chain ID", placeholder: "137" },
  { kind: "text", key: "to_chain_id", label: "To chain ID", placeholder: "42161" },
  { kind: "text", key: "from_token", label: "From token", placeholder: "USDC" },
  { kind: "text", key: "to_token", label: "To token", placeholder: "ETH" },
  { kind: "number", key: "slippage_bps", label: "Slippage", default: 50, min: 0, max: 1000, suffix: "bps" },
];

/** Shared operators for the guided condition builder. */
const CONDITION_OPERATORS = [
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "gte", label: "≥" },
  { value: "lte", label: "≤" },
  { value: "eq", label: "=" },
  { value: "neq", label: "≠" },
  { value: "crosses_above", label: "crosses ↑" },
  { value: "crosses_below", label: "crosses ↓" },
];

/** v1 nodes only (v2 / future hidden). Grouped for the palette. */
const RAW_NODE_CATALOG: NodeCatalogEntry[] = [
  // Workflow control
  { slug: "workflow-start", title: "Start", group: "Workflow", category: "control", icon: "Play", description: "Entry point — fires when the run begins.", inputs: [], outputs: [{ kind: "trigger" }] },
  { slug: "workflow-approve", title: "Approve", group: "Workflow", category: "control", icon: "ShieldCheck", description: "Human gate — pause until you approve.", inputs: [{ kind: "trigger" }, { kind: "order_intent" }], outputs: [{ kind: "trigger" }], fields: [{ kind: "text", key: "label", label: "Label", placeholder: "Approval gate" }, { kind: "text", key: "message", label: "Message", placeholder: "Review before placing order" }] },
  { slug: "workflow-stop", title: "Stop", group: "Workflow", category: "control", icon: "Square", description: "Terminate the branch or run.", inputs: [{ kind: "trigger" }, { kind: "signal" }], outputs: [], fields: [{ kind: "text", key: "reason", label: "Reason", placeholder: "branch complete" }] },

  // Data / feeds
  {
    slug: "price-chart",
    title: "Price Chart",
    group: "Data & Feeds",
    category: "data",
    icon: "LineChart",
    description: "Live chart — resize, switch type, feed data.",
    inputs: [{ kind: "signal" }, { kind: "data" }],
    outputs: [{ kind: "data" }],
    nodeType: "chart",
    fields: [
      { kind: "text", key: "pair", label: "Pair", required: true, default: "BTC/USD", placeholder: "BTC/USD" },
      {
        kind: "select",
        key: "interval",
        label: "Interval",
        default: "1h",
        options: [
          { value: "1m", label: "1m" },
          { value: "5m", label: "5m" },
          { value: "1h", label: "1h" },
          { value: "1d", label: "1d" },
        ],
      },
      {
        kind: "select",
        key: "chart_type",
        label: "Chart type",
        default: "candlestick",
        options: [
          { value: "candlestick", label: "Candlestick" },
          { value: "line", label: "Line" },
          { value: "area", label: "Area" },
        ],
      },
    ],
  },
  {
    slug: "whale-tx-tracker",
    title: "Whale Tracker",
    group: "Data & Feeds",
    category: "data",
    icon: "Waves",
    description: "Fire on large transfers for a token/wallet.",
    inputs: [],
    outputs: [{ kind: "trigger" }, { kind: "data" }],
    fields: [
      { kind: "number", key: "min_usd", label: "Min USD", default: 100000, min: 0, suffix: "USD" },
      { kind: "text", key: "token", label: "Token filter", placeholder: "USDC or 0x…" },
      { kind: "text", key: "wallet", label: "Wallet filter", placeholder: "0x… (optional)" },
    ],
  },
  {
    slug: "wallet-balance",
    title: "Wallet Balance",
    group: "Data & Feeds",
    category: "data",
    icon: "Wallet",
    description: "Read agent wallet balances for gating.",
    inputs: [{ kind: "trigger" }],
    outputs: [{ kind: "data" }],
    fields: [{ kind: "text", key: "token", label: "Token filter", placeholder: "USDC (optional)" }],
  },

  // Logic
  {
    slug: "if-condition",
    title: "IF",
    group: "Logic",
    category: "logic",
    icon: "GitBranch",
    description: "Branch on a boolean expression.",
    inputs: [{ kind: "trigger" }, { kind: "data" }],
    outputs: [{ kind: "trigger" }],
    preview: "result",
    fields: [
      {
        kind: "branches",
        key: "branches",
        label: "Conditions",
        defaultOp: "gt",
        operators: CONDITION_OPERATORS,
        leftPlaceholder: "field (e.g. price.mid)",
        rightPlaceholder: "value or field",
        addLabel: "Add else-if",
      },
    ],
  },
  {
    slug: "compare",
    title: "Compare",
    group: "Logic",
    category: "logic",
    icon: "Scale",
    description: "Compare two values (>, <, crosses…).",
    inputs: [{ kind: "data" }],
    outputs: [{ kind: "signal" }, { kind: "trigger" }],
    fields: [
      {
        kind: "condition",
        key: "compare",
        label: "Compare",
        leftKey: "a",
        opKey: "operator",
        rightKey: "b",
        defaultOp: "gt",
        operators: CONDITION_OPERATORS,
        leftPlaceholder: "value A",
        rightPlaceholder: "value B",
      },
    ],
  },
  {
    slug: "threshold",
    title: "Threshold",
    group: "Logic",
    category: "logic",
    icon: "Gauge",
    description: "Fire when a metric crosses a bound.",
    inputs: [{ kind: "data" }],
    outputs: [{ kind: "trigger" }, { kind: "signal" }],
    fields: [
      {
        kind: "select",
        key: "metric",
        label: "Metric",
        default: "mid",
        options: [
          { value: "mid", label: "Mid" },
          { value: "best_bid", label: "Best bid" },
          { value: "best_ask", label: "Best ask" },
          { value: "value", label: "Scalar value" },
        ],
      },
      {
        kind: "select",
        key: "operator",
        label: "Operator",
        default: "<",
        options: [
          { value: "<", label: "<" },
          { value: ">", label: ">" },
          { value: "<=", label: "<=" },
          { value: ">=", label: ">=" },
        ],
      },
      { kind: "number", key: "value", label: "Threshold", default: 0.4, min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    slug: "policy-gate",
    title: "Policy Gate",
    group: "Logic",
    category: "logic",
    icon: "ShieldCheck",
    description: "Enforce spend caps & allow-lists before actions.",
    inputs: [{ kind: "order_intent" }, { kind: "trigger" }],
    outputs: [{ kind: "trigger" }, { kind: "data" }],
    preview: "result",
    fields: [
      {
        kind: "select",
        key: "policy_mode",
        label: "Policy source",
        default: "inherit",
        options: [
          { value: "inherit", label: "Use workflow policy" },
          { value: "override", label: "Draft overrides (not enforced in Live)" },
        ],
      },
      {
        kind: "text",
        key: "_note",
        label: "Workflow policy",
        default: "Live enforcement reads workflow policy (caps, allowed actions, kill switch). Edit under Workflow → Policy.",
        showWhen: { key: "policy_mode", in: ["inherit"] },
      },
      {
        kind: "number",
        key: "max_single_action_usd",
        label: "Max single action",
        default: 100,
        min: 1,
        suffix: "USD",
        showWhen: { key: "policy_mode", in: ["override"] },
      },
      {
        kind: "text",
        key: "allowed_actions",
        label: "Allowed actions",
        placeholder: "place_order, polymarket_place_market, lifi_swap",
        showWhen: { key: "policy_mode", in: ["override"] },
      },
      {
        kind: "toggle",
        key: "require_approve",
        label: "Require approve step",
        default: true,
        showWhen: { key: "policy_mode", in: ["override"] },
      },
    ],
  },
  { slug: "dry-run-gate", title: "Dry-run Gate", group: "Logic", category: "logic", icon: "FlaskConical", description: "Route to simulator in Dry; pass through in Live.", inputs: [{ kind: "order_intent" }, { kind: "trigger" }], outputs: [{ kind: "trigger" }, { kind: "order_intent" }] },

  // Actions
  {
    slug: "place-order",
    title: "Place Order",
    group: "Actions",
    category: "action",
    icon: "Coins",
    description: "Build, sign & submit a Polymarket order.",
    inputs: [{ kind: "trigger" }, { kind: "market" }, { kind: "order_intent" }],
    outputs: [{ kind: "data" }],
    preview: "order",
    fields: POLYMARKET_ORDER_FIELDS,
  },
  {
    slug: "swap",
    title: "Swap",
    group: "Actions",
    category: "action",
    icon: "ArrowLeftRight",
    description: "Same-chain token swap via Li-Fi.",
    inputs: [{ kind: "trigger" }, { kind: "order_intent" }],
    outputs: [{ kind: "data" }],
    fields: LIFI_CORRIDOR_FIELDS,
  },
  {
    slug: "bridge",
    title: "Bridge",
    group: "Actions",
    category: "action",
    icon: "Waypoints",
    description: "Cross-chain bridge via Li-Fi.",
    inputs: [{ kind: "trigger" }, { kind: "order_intent" }],
    outputs: [{ kind: "data" }],
    fields: LIFI_CORRIDOR_FIELDS,
  },
  { slug: "transfer", title: "Transfer", group: "Actions", category: "action", icon: "Send", description: "Send tokens to a recipient (allow-listed).", inputs: [{ kind: "trigger" }, { kind: "order_intent" }], outputs: [{ kind: "data" }] },
  {
    slug: "copy-trade",
    title: "Copy Trade",
    group: "Actions",
    category: "action",
    icon: "Copy",
    description: "Mirror a leader wallet's trades — optionally AI-filtered.",
    preview: "copytrade",
    inputs: [
      { kind: "trigger" },
      { kind: "data", label: "leader" },
      { kind: "signal", label: "ai" },
      { kind: "market" },
    ],
    outputs: [{ kind: "order_intent" }, { kind: "data" }],
    fields: [
      {
        kind: "text",
        key: "leader",
        label: "Leader wallet",
        required: true,
        placeholder: "0x… / .eth — or connect an address",
      },
      {
        kind: "select",
        key: "venue",
        label: "Venue",
        default: "polymarket",
        options: [
          { value: "polymarket", label: "Polymarket" },
          { value: "limitless", label: "Limitless" },
          { value: "defi", label: "DeFi (Li-Fi)" },
        ],
      },
      { kind: "number", key: "mirror_pct", label: "Mirror size", default: 100, min: 1, max: 100, suffix: "%" },
      { kind: "number", key: "max_per_trade", label: "Max / trade", default: 200, min: 0, suffix: "USDC" },
      { kind: "number", key: "max_slippage", label: "Max slippage", default: 100, min: 0, suffix: "bps" },
      { kind: "toggle", key: "ai_filter", label: "AI-filter trades", default: false },
    ],
  },

  // Polymarket (consolidated: 3 nodes compile to the doc's slugs)
  {
    slug: "polymarket-market",
    title: "Polymarket Market",
    group: "Polymarket",
    category: "data",
    icon: "polymarket",
    description: "Book, trades, mid & spread for a market.",
    inputs: [],
    outputs: [{ kind: "market" }, { kind: "data" }],
    preview: "book",
    fields: [
      { kind: "market", key: "market", label: "Market", required: true, placeholder: "Search market…" },
      {
        kind: "select",
        key: "outcome",
        label: "Outcome",
        required: true,
        default: "yes",
        options: [
          { value: "yes", label: "YES" },
          { value: "no", label: "NO" },
        ],
      },
      {
        kind: "select",
        key: "depth",
        label: "Depth",
        default: "5",
        options: [
          { value: "3", label: "3" },
          { value: "5", label: "5" },
          { value: "10", label: "10" },
        ],
      },
    ],
  },
  {
    slug: "polymarket-order",
    title: "Polymarket Order",
    group: "Polymarket",
    category: "action",
    icon: "polymarket",
    description: "Place limit/market or cancel a CLOB order.",
    inputs: [{ kind: "trigger" }, { kind: "market" }, { kind: "order_intent" }],
    outputs: [{ kind: "data" }],
    preview: "order",
    fields: POLYMARKET_ORDER_FIELDS,
  },
  {
    slug: "polymarket-positions",
    title: "Polymarket Positions",
    group: "Polymarket",
    category: "data",
    icon: "polymarket",
    description: "Positions, open orders & pUSD allowance.",
    inputs: [{ kind: "trigger" }],
    outputs: [{ kind: "data" }, { kind: "signal" }],
    preview: "positions",
    fields: [
      {
        kind: "select",
        key: "scope",
        label: "Scope",
        default: "agent",
        options: [{ value: "agent", label: "This wallet" }],
      },
      {
        kind: "select",
        key: "refresh",
        label: "Refresh",
        default: "15s",
        options: [
          { value: "10s", label: "10s" },
          { value: "15s", label: "15s" },
          { value: "30s", label: "30s" },
        ],
      },
    ],
  },

  // Li-Fi
  {
    slug: "lifi-quote",
    title: "Li-Fi Quote",
    group: "Li-Fi",
    category: "action",
    icon: "lifi",
    description: "Fetch swap/bridge routes for a corridor.",
    inputs: [{ kind: "trigger" }],
    outputs: [{ kind: "order_intent" }, { kind: "data" }],
    fields: LIFI_CORRIDOR_FIELDS,
  },
  { slug: "lifi-route-status", title: "Route Status", group: "Li-Fi", category: "data", icon: "lifi", description: "Track an in-flight bridge/route.", inputs: [{ kind: "trigger" }], outputs: [{ kind: "data" }] },

  // Limitless Exchange (Base prediction market — read parts active; trading coming soon)
  {
    slug: "limitless-market",
    title: "Limitless Market",
    group: "Limitless",
    category: "data",
    icon: "limitless",
    description: "Book, prices & spread for a Limitless market.",
    inputs: [],
    outputs: [{ kind: "market" }, { kind: "data" }],
    preview: "book",
    fields: [
      { kind: "market", key: "market", label: "Market", required: true, placeholder: "Market slug…" },
      {
        kind: "select",
        key: "outcome",
        label: "Outcome",
        required: true,
        default: "yes",
        options: [
          { value: "yes", label: "YES" },
          { value: "no", label: "NO" },
        ],
      },
      {
        kind: "select",
        key: "depth",
        label: "Depth",
        default: "5",
        options: [
          { value: "3", label: "3" },
          { value: "5", label: "5" },
          { value: "10", label: "10" },
        ],
      },
    ],
  },
  {
    slug: "limitless-order",
    title: "Limitless Order",
    group: "Limitless",
    category: "action",
    icon: "limitless",
    description: "Place/cancel orders (trading coming soon).",
    comingSoon: true,
    inputs: [{ kind: "trigger" }, { kind: "market" }, { kind: "order_intent" }],
    outputs: [{ kind: "data" }],
    preview: "order",
    fields: [
      {
        kind: "select",
        key: "operation",
        label: "Operation",
        required: true,
        default: "place_limit",
        options: [
          { value: "place_limit", label: "Place Limit" },
          { value: "place_market", label: "Place Market" },
          { value: "cancel", label: "Cancel" },
        ],
      },
      {
        kind: "select",
        key: "outcome",
        label: "Outcome",
        required: true,
        default: "yes",
        showWhen: { key: "operation", in: ["place_limit", "place_market"] },
        options: [
          { value: "yes", label: "YES" },
          { value: "no", label: "NO" },
        ],
      },
      {
        kind: "select",
        key: "side",
        label: "Side",
        required: true,
        default: "buy",
        showWhen: { key: "operation", in: ["place_limit", "place_market"] },
        options: [
          { value: "buy", label: "BUY" },
          { value: "sell", label: "SELL" },
        ],
      },
      {
        kind: "number",
        key: "size",
        label: "Size",
        required: true,
        default: 50,
        min: 0,
        suffix: "USDC",
        showWhen: { key: "operation", in: ["place_limit", "place_market"] },
      },
      {
        kind: "number",
        key: "price",
        label: "Price",
        required: true,
        default: 0.39,
        min: 0,
        max: 1,
        step: 0.01,
        showWhen: { key: "operation", in: ["place_limit"] },
      },
      {
        kind: "select",
        key: "tif",
        label: "Time in force",
        default: "gtc",
        showWhen: { key: "operation", in: ["place_limit"] },
        options: [
          { value: "gtc", label: "GTC" },
          { value: "fak", label: "FAK" },
          { value: "fok", label: "FOK" },
        ],
      },
      {
        kind: "text",
        key: "order_id",
        label: "Order",
        required: true,
        placeholder: "order id or filter",
        showWhen: { key: "operation", in: ["cancel"] },
      },
    ],
  },
  {
    slug: "limitless-positions",
    title: "Limitless Positions",
    group: "Limitless",
    category: "data",
    icon: "limitless",
    description: "Positions & open orders on Limitless.",
    inputs: [{ kind: "trigger" }],
    outputs: [{ kind: "data" }, { kind: "signal" }],
    preview: "positions",
    fields: [
      {
        kind: "select",
        key: "scope",
        label: "Scope",
        default: "agent",
        options: [{ value: "agent", label: "This wallet" }],
      },
      {
        kind: "select",
        key: "refresh",
        label: "Refresh",
        default: "15s",
        options: [
          { value: "10s", label: "10s" },
          { value: "15s", label: "15s" },
          { value: "30s", label: "30s" },
        ],
      },
    ],
  },

  // UI / display
  {
    slug: "ui-button",
    title: "UI Button",
    group: "UI",
    category: "ui",
    icon: "MousePointerClick",
    description: "Clickable control that fires a trigger.",
    inputs: [{ kind: "data" }],
    outputs: [{ kind: "trigger" }],
    fields: [{ kind: "text", key: "label", label: "Button label", default: "Run", placeholder: "Execute" }],
  },
  {
    slug: "ui-table",
    title: "UI Table",
    group: "UI",
    category: "ui",
    icon: "Table",
    description: "Tabular bind — rows, orders, positions.",
    inputs: [{ kind: "data" }],
    outputs: [{ kind: "signal" }],
    fields: [
      { kind: "text", key: "title", label: "Title", default: "Open orders", placeholder: "Open orders" },
      { kind: "number", key: "max_rows", label: "Max rows", default: 10, min: 1, max: 100 },
      {
        kind: "text",
        key: "columns",
        label: "Columns",
        placeholder: "market, side, size, price (comma-separated)",
      },
      {
        kind: "text",
        key: "highlight_column",
        label: "Highlight column",
        placeholder: "side (optional)",
      },
    ],
  },
  {
    slug: "ui-label",
    title: "UI Label",
    group: "UI",
    category: "ui",
    icon: "Type",
    description: "Display a bound value or status.",
    inputs: [{ kind: "data" }, { kind: "signal" }],
    outputs: [],
    fields: [
      {
        kind: "text",
        key: "label_text",
        label: "Label text",
        required: true,
        default: "Mid",
        placeholder: "Mid price",
      },
      {
        kind: "select",
        key: "value_format",
        label: "Value format",
        default: "plain",
        options: [
          { value: "plain", label: "Plain" },
          { value: "price", label: "Price (0.00)" },
          { value: "percent", label: "Percent" },
        ],
      },
      { kind: "text", key: "prefix", label: "Prefix", placeholder: "$" },
      { kind: "text", key: "suffix", label: "Suffix", placeholder: " USDC" },
    ],
  },
  {
    slug: "ui-chart",
    title: "UI Chart",
    group: "UI",
    category: "ui",
    icon: "BarChart3",
    description: "Generic chart from an upstream series.",
    inputs: [{ kind: "data" }],
    outputs: [{ kind: "data" }],
    preview: "bars",
    fields: [
      { kind: "text", key: "title", label: "Chart title", default: "Price", placeholder: "Price" },
      {
        kind: "select",
        key: "chart_type",
        label: "Chart type",
        default: "line",
        options: [
          { value: "line", label: "Line" },
          { value: "area", label: "Area" },
          { value: "bar", label: "Bar" },
        ],
      },
    ],
  },

  // AI
  {
    slug: "ai-reason",
    title: "AI Reasoning",
    group: "AI",
    category: "ai",
    icon: "Brain",
    description: "Bounded LLM step — classify or decide (runtime stub: passthrough only).",
    inputs: [{ kind: "trigger" }, { kind: "data" }],
    outputs: [{ kind: "signal" }, { kind: "data" }],
    fields: [
      {
        kind: "textarea",
        key: "prompt",
        label: "Instruction",
        required: true,
        rows: 7,
        placeholder: "Classify whether to buy…",
      },
      { kind: "number", key: "max_tokens", label: "Max tokens", default: 256, min: 32, max: 4096 },
    ],
  },

  // Utility
  {
    slug: "schedule-cron",
    title: "Schedule / Cron",
    group: "Utility",
    category: "control",
    icon: "Clock",
    description: "Time-based trigger (cron / interval).",
    inputs: [],
    outputs: [{ kind: "trigger" }],
    fields: [
      { kind: "text", key: "cron", label: "Cron expression", placeholder: "0 9 * * *" },
      { kind: "text", key: "interval", label: "Interval", placeholder: "15m (alternative to cron)" },
    ],
  },
  {
    slug: "notify",
    title: "Notify",
    group: "Utility",
    category: "control",
    icon: "Bell",
    description: "Send an alert (in-app, email, webhook).",
    inputs: [{ kind: "trigger" }, { kind: "data" }],
    outputs: [{ kind: "data" }],
    fields: [
      {
        kind: "select",
        key: "channel",
        label: "Channel",
        default: "in_app",
        options: [
          { value: "in_app", label: "In-app" },
          { value: "webhook", label: "Webhook" },
        ],
      },
      { kind: "text", key: "message", label: "Message template", placeholder: "Threshold crossed: {{mid}}" },
    ],
  },
  {
    slug: "delay",
    title: "Delay",
    group: "Utility",
    category: "control",
    icon: "Timer",
    description: "Pause for a duration (durable resume).",
    inputs: [{ kind: "trigger" }],
    outputs: [{ kind: "trigger" }],
    fields: [{ kind: "number", key: "duration_seconds", label: "Duration", default: 60, min: 1, suffix: "s" }],
  },
];

export const NODE_CATALOG: NodeCatalogEntry[] = RAW_NODE_CATALOG.map((entry) => ({
  ...entry,
  portDocs: entry.portDocs ?? NODE_PORT_DOCS[entry.slug],
}));

/** The handful shown first in the palette (before "See more"). */
export const COMMON_NODE_SLUGS: string[] = [
  "workflow-start",
  "price-chart",
  "polymarket-market",
  "if-condition",
  "workflow-approve",
  "polymarket-order",
];

export const NODE_GROUP_ORDER = [
  "Workflow",
  "Data & Feeds",
  "Logic",
  "Actions",
  "Polymarket",
  "Limitless",
  "Li-Fi",
  "UI",
  "AI",
  "Utility",
];

/** Build a board node's data payload from a catalog entry. */
export function nodeDataFromCatalog(entry: NodeCatalogEntry): RichNodeData {
  return {
    category: entry.category,
    icon: entry.icon,
    title: entry.title,
    catalogSlug: entry.slug,
    preview: entry.preview ?? "none",
    config: entry.config ?? [],
    fields: entry.fields,
    values: entry.fields ? defaultConfigValues(entry.fields) : undefined,
    inputs: entry.inputs,
    outputs: entry.outputs,
    isAction: entry.category === "action",
    comingSoon: entry.comingSoon,
  };
}
