import type { CanvasAgentLlmConfig } from "../llm/canvas-llm.types.js";

export const CANVAS_GRAPH_SCHEMA_VERSION = "1.0.0" as const;

export type CanvasGraphSchemaVersion = typeof CANVAS_GRAPH_SCHEMA_VERSION;

export const CANVAS_WORKFLOW_STATUSES = [
  "draft",
  "dry_run_ready",
  "live",
  "paused",
  "archived",
] as const;

export type CanvasWorkflowStatus = (typeof CANVAS_WORKFLOW_STATUSES)[number];

export const PORT_KINDS = [
  "trigger",
  "signal",
  "market",
  "order_intent",
  "data",
] as const;

export type PortKind = (typeof PORT_KINDS)[number];

export const CANVAS_NODE_TYPES = [
  // Workflow control
  "workflow_start",
  "workflow_approve",
  "workflow_stop",
  "workflow_pause",
  "workflow_resume",
  // Data / feed & UI
  "price_chart",
  "polymarket_feed",
  "polymarket_orderbook",
  "polymarket_positions",
  "limitless_feed",
  "whale_tx_tracker",
  // Protocol actions — Polymarket
  "polymarket_place_limit",
  "polymarket_place_market",
  "polymarket_cancel_order",
  "place_order",
  // Protocol actions — Li-Fi
  "lifi_quote",
  "lifi_swap",
  "lifi_bridge",
  "lifi_route_status",
  "lifi_liquidity_fallback",
  "swap_bridge",
  // UI / display
  "ui_button",
  "ui_label",
  "ui_table",
  "ui_chart",
  "ui_panel",
  // Logic / action / agent
  "copy_trade",
  "if_condition",
  "compare",
  "threshold",
  "policy_gate",
  "dry_run_gate",
  "wallet_balance",
  "schedule_cron",
  "delay",
  "ai_reason",
  "notify",
  "custom_app_action",
] as const;

export type CanvasNodeType = (typeof CANVAS_NODE_TYPES)[number];

export type CanvasNodePreviewState = "idle" | "loading" | "ready" | "error";

export type CanvasNode = {
  id: string;
  type: CanvasNodeType;
  position: { x: number; y: number };
  size?: { w: number; h: number };
  config: Record<string, unknown>;
  preview_state?: CanvasNodePreviewState;
  meta?: { label?: string; builder_note?: string };
};

export type CanvasEdgeEndpoint = {
  node_id: string;
  port: PortKind;
};

export type CanvasEdge = {
  id: string;
  source: CanvasEdgeEndpoint;
  target: CanvasEdgeEndpoint;
};

export type CanvasViewport = {
  x: number;
  y: number;
  zoom: number;
};

/** Graph JSON stored in Prisma `canvas_workflows.graph` JSONB column. */
export type CanvasGraph = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport?: CanvasViewport;
};

export type { CanvasAgentLlmConfig };

/** Full workflow document — metadata + graph fields. */
export type CanvasWorkflowDocument = {
  schema_version: CanvasGraphSchemaVersion;
  workflow_id: string;
  user_id: string;
  name: string;
  status: CanvasWorkflowStatus;
  revision: number;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport?: CanvasViewport;
  policy_id: string;
  build_config?: CanvasAgentLlmConfig;
  tester_config?: CanvasAgentLlmConfig;
  created_at: string;
  updated_at: string;
};
