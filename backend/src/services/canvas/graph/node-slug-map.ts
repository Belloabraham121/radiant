import type { CanvasNodeType } from "./canvas-graph.types.js";

/** v1 Builder catalog slugs (kebab-case) → compiler node types (snake_case). */
const SLUG_TO_NODE_TYPE: Record<string, CanvasNodeType> = {
  "workflow-start": "workflow_start",
  "workflow-approve": "workflow_approve",
  "workflow-stop": "workflow_stop",
  "price-chart": "price_chart",
  "polymarket-feed": "polymarket_feed",
  "polymarket-orderbook": "polymarket_orderbook",
  "polymarket-positions": "polymarket_positions",
  "polymarket-market": "polymarket_feed",
  "polymarket-order": "place_order",
  "polymarket-place-limit": "polymarket_place_limit",
  "polymarket-place-market": "polymarket_place_market",
  "polymarket-cancel-order": "polymarket_cancel_order",
  "whale-tx-tracker": "whale_tx_tracker",
  "wallet-balance": "wallet_balance",
  "if-condition": "if_condition",
  compare: "compare",
  threshold: "threshold",
  "policy-gate": "policy_gate",
  "dry-run-gate": "dry_run_gate",
  "place-order": "place_order",
  swap: "lifi_swap",
  bridge: "lifi_bridge",
  transfer: "custom_app_action",
  "copy-trade": "copy_trade",
  "lifi-quote": "lifi_quote",
  "lifi-swap": "lifi_swap",
  "lifi-bridge": "lifi_bridge",
  "lifi-route-status": "lifi_route_status",
  "lifi-liquidity-fallback": "lifi_liquidity_fallback",
  "ui-button": "ui_button",
  "ui-table": "ui_table",
  "ui-label": "ui_label",
  "ui-chart": "ui_chart",
  "ui-panel": "ui_panel",
  "ai-reason": "ai_reason",
  "schedule-cron": "schedule_cron",
  notify: "notify",
  delay: "delay",
};

const NODE_TYPE_TO_SLUG = new Map<string, string>(
  Object.entries(SLUG_TO_NODE_TYPE).map(([slug, type]) => [type, slug]),
);

/** Node types that should emit workflow.node.focus after add_node. */
export const BUILDER_FOCUS_NODE_TYPES = new Set<CanvasNodeType>([
  "price_chart",
  "polymarket_feed",
  "polymarket_orderbook",
  "polymarket_positions",
  "polymarket_place_limit",
  "polymarket_place_market",
  "polymarket_cancel_order",
  "place_order",
  "lifi_quote",
  "lifi_swap",
  "lifi_bridge",
  "workflow_approve",
  "copy_trade",
]);

export const BUILDER_V1_NODE_SLUGS = Object.keys(SLUG_TO_NODE_TYPE);

export function slugToNodeType(slug: string): CanvasNodeType | null {
  const normalized = slug.trim().toLowerCase();
  return SLUG_TO_NODE_TYPE[normalized] ?? null;
}

export function nodeTypeToSlug(nodeType: CanvasNodeType): string {
  return NODE_TYPE_TO_SLUG.get(nodeType) ?? nodeType.replace(/_/g, "-");
}

export function isBuilderV1Slug(slug: string): boolean {
  return slug.trim().toLowerCase() in SLUG_TO_NODE_TYPE;
}
