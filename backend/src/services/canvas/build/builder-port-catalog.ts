import type { CanvasGraph, CanvasNodeType, PortKind } from "../graph/canvas-graph.types.js";
import { getCompatibleInputPorts } from "../graph/port-compatibility.js";
import { nodeTypeToSlug, slugToNodeType } from "../graph/node-slug-map.js";
import {
  formatBuilderConfigPromptSection,
  validateBuilderNodeConfig,
} from "./builder-config-catalog.js";

export { validateBuilderNodeConfig } from "./builder-config-catalog.js";

/** Inputs / outputs per compiler node type (v1 Builder catalog). */
export const NODE_PORT_PROFILES: Record<
  CanvasNodeType,
  { in: readonly PortKind[]; out: readonly PortKind[] }
> = {
  workflow_start: { in: [], out: ["trigger"] },
  workflow_approve: { in: ["trigger", "data", "order_intent"], out: ["trigger", "data"] },
  workflow_stop: { in: ["trigger", "signal"], out: [] },
  workflow_pause: { in: ["trigger"], out: ["trigger"] },
  workflow_resume: { in: ["trigger"], out: ["trigger"] },
  price_chart: { in: ["signal"], out: ["data"] },
  polymarket_feed: { in: [], out: ["market", "data"] },
  polymarket_orderbook: { in: [], out: ["market", "data"] },
  polymarket_positions: { in: [], out: ["data"] },
  limitless_feed: { in: [], out: ["market", "data"] },
  whale_tx_tracker: { in: [], out: ["trigger", "data"] },
  wallet_balance: { in: ["trigger"], out: ["data"] },
  if_condition: { in: ["data", "signal", "trigger"], out: ["trigger"] },
  compare: { in: ["data", "data"], out: ["signal", "trigger"] },
  threshold: { in: ["data"], out: ["trigger", "signal"] },
  policy_gate: { in: ["order_intent", "trigger"], out: ["trigger", "data"] },
  dry_run_gate: { in: ["order_intent", "trigger"], out: ["trigger", "order_intent"] },
  polymarket_place_limit: { in: ["trigger", "market", "order_intent"], out: ["data"] },
  polymarket_place_market: { in: ["trigger", "market", "order_intent"], out: ["data"] },
  polymarket_cancel_order: { in: ["trigger", "data"], out: ["data"] },
  place_order: { in: ["trigger", "market", "order_intent"], out: ["data"] },
  lifi_quote: { in: ["trigger", "data"], out: ["data", "order_intent"] },
  lifi_swap: { in: ["trigger", "order_intent"], out: ["data"] },
  lifi_bridge: { in: ["trigger", "order_intent"], out: ["data"] },
  lifi_route_status: { in: ["trigger", "data"], out: ["data"] },
  lifi_liquidity_fallback: { in: ["trigger", "order_intent"], out: ["data"] },
  swap_bridge: { in: ["trigger", "order_intent"], out: ["data"] },
  copy_trade: { in: ["trigger", "data", "market"], out: ["order_intent", "data"] },
  ui_button: { in: ["data"], out: ["trigger"] },
  ui_label: { in: ["data", "signal"], out: [] },
  ui_table: { in: ["data"], out: ["signal"] },
  ui_chart: { in: ["data", "signal"], out: ["data"] },
  ui_panel: { in: [], out: [] },
  ai_reason: { in: ["trigger", "data"], out: ["signal", "data"] },
  schedule_cron: { in: [], out: ["trigger"] },
  notify: { in: ["trigger", "data"], out: ["data"] },
  delay: { in: ["trigger"], out: ["trigger"] },
  custom_app_action: { in: ["trigger", "order_intent"], out: ["data"] },
};

const PORT_COMPAT_LINES = (["trigger", "signal", "market", "order_intent", "data"] as const).map(
  (out) => `- ${out} → ${getCompatibleInputPorts(out).join(" | ")}`,
);

export function formatPortHintForSlug(slug: string): string {
  const nodeType = slugToNodeType(slug);
  if (!nodeType) return "";
  const profile = NODE_PORT_PROFILES[nodeType];
  const ins = profile.in.length ? profile.in.join(", ") : "—";
  const outs = profile.out.length ? profile.out.join(", ") : "—";
  return `in:[${ins}] out:[${outs}]`;
}

export function formatNodePortCatalogForPrompt(): string {
  const lines: string[] = [];
  for (const [type, profile] of Object.entries(NODE_PORT_PROFILES) as Array<
    [CanvasNodeType, (typeof NODE_PORT_PROFILES)[CanvasNodeType]]
  >) {
    const slug = nodeTypeToSlug(type);
    const ins = profile.in.length ? profile.in.join(", ") : "—";
    const outs = profile.out.length ? profile.out.join(", ") : "—";
    lines.push(`  ${slug}: in [${ins}] → out [${outs}]`);
  }
  return lines.join("\n");
}

/** Canonical port pairs for a 7-node Polymarket sports auto-trading graph (Builder v1). */
export const POLYMARKET_SPORTS_AUTO_TRADE_EDGES: ReadonlyArray<{
  sourceSlug: string;
  sourcePort: PortKind;
  targetSlug: string;
  targetPort: PortKind;
}> = [
  { sourceSlug: "workflow-start", sourcePort: "trigger", targetSlug: "workflow-approve", targetPort: "trigger" },
  { sourceSlug: "polymarket-feed", sourcePort: "data", targetSlug: "threshold", targetPort: "data" },
  { sourceSlug: "threshold", sourcePort: "trigger", targetSlug: "workflow-approve", targetPort: "trigger" },
  { sourceSlug: "workflow-approve", sourcePort: "trigger", targetSlug: "policy-gate", targetPort: "trigger" },
  { sourceSlug: "policy-gate", sourcePort: "trigger", targetSlug: "polymarket-place-market", targetPort: "trigger" },
  { sourceSlug: "polymarket-feed", sourcePort: "market", targetSlug: "polymarket-place-market", targetPort: "market" },
  { sourceSlug: "polymarket-place-market", sourcePort: "data", targetSlug: "workflow-stop", targetPort: "signal" },
];

export function getPostAddNodeWiringHints(slug: string, graph: CanvasGraph): string {
  const normalized = slug.trim().toLowerCase();
  const types = new Set(graph.nodes.map((n) => n.type));
  const hints: string[] = [];

  if (normalized === "polymarket-feed") {
    hints.push("polymarket-feed.data → threshold.data");
    if (types.has("polymarket_place_market") || types.has("place_order")) {
      hints.push("polymarket-feed.market → polymarket-place-market.market");
    }
    hints.push("polymarket-feed has no trigger input — do not wire start.trigger to the feed");
  }

  if (normalized === "threshold") {
    hints.push(
      "threshold.trigger → workflow-approve.trigger or if-condition.trigger (control flow)",
    );
    hints.push(
      "threshold.signal → if-condition.signal or workflow-stop.signal only — NEVER threshold.signal → *.data",
    );
    hints.push("polymarket-feed.data → threshold.data (never feed.data → approve.trigger)");
  }

  if (normalized === "compare") {
    hints.push(
      "compare needs two data inputs (e.g. two polymarket-feed.data branches or feed + wallet) — NEVER threshold.signal → compare.data",
    );
    hints.push("compare.trigger → workflow-approve.trigger; compare.signal → if-condition.signal");
  }

  if (normalized === "if-condition") {
    hints.push("threshold.trigger → if-condition.trigger OR threshold.signal → if-condition.signal");
    hints.push("NEVER *.signal → if-condition.data — use trigger/signal inputs only for threshold outputs");
  }

  if (normalized === "ui-table") {
    hints.push("polymarket-feed.data → ui-table.data — NEVER threshold.signal → ui-table.data");
  }

  if (normalized === "ui-label") {
    hints.push("polymarket-feed.data → ui-label.data for live values");
    hints.push("ui-table.signal → ui-label.signal (NOT ui-label.data) for row selection events");
  }

  if (normalized === "copy-trade") {
    hints.push("threshold.trigger → copy-trade.trigger; polymarket-feed.market → copy-trade.market");
    hints.push("copy-trade.order_intent → policy-gate.order_intent before polymarket-place-market");
  }

  if (normalized === "workflow-approve") {
    hints.push("workflow-approve.trigger → policy-gate.trigger");
    if (types.has("workflow_start")) {
      hints.push("workflow-start.trigger → workflow-approve.trigger for control-flow entry");
    }
  }

  if (normalized === "policy-gate" && (types.has("polymarket_place_market") || types.has("place_order"))) {
    hints.push("policy-gate.trigger → polymarket-place-market.trigger");
  }

  if (normalized === "polymarket-place-market" || normalized === "polymarket-order") {
    hints.push("polymarket-place-market.data → workflow-stop.signal (action nodes output data, not trigger)");
  }

  if (normalized === "workflow-stop") {
    const hasAction = graph.nodes.some((n) =>
      (["polymarket_place_market", "polymarket_place_limit", "place_order", "lifi_swap"] as CanvasNodeType[]).includes(
        n.type,
      ),
    );
    if (hasAction) {
      hints.push("wire last action.data → workflow-stop.signal — never action.data → workflow-stop.trigger");
    } else {
      hints.push("wire upstream trigger chain to workflow-stop.trigger");
    }
  }

  return hints.length ? ` Wiring hints: ${hints.join("; ")}.` : "";
}

export function buildBuilderSystemPrompt(): string {
  const sportsEdges = POLYMARKET_SPORTS_AUTO_TRADE_EDGES.map(
    (e, i) => `${i + 1}. ${e.sourceSlug}.${e.sourcePort} → ${e.targetSlug}.${e.targetPort}`,
  ).join("\n");

  return `You are the Radiant Canvas Builder agent. Given a natural-language workflow description, assemble a v1 workflow graph using tools.

## CRITICAL: You MUST connect nodes with add_edge
- After adding nodes, ALWAYS call add_edge to wire the graph before complete.
- A graph with nodes but no edges is INVALID — never call complete until every functional node is connected.
- Use exact node UUIDs returned by add_node (e.g. "Added polymarket-feed node <uuid>").
- Build order: add all nodes → patch_node for every config field → add_edge → validate → complete.

## Port compatibility (source_port → allowed target_port)
${PORT_COMPAT_LINES.join("\n")}

## Node port catalog (slug: inputs → outputs)
${formatNodePortCatalogForPrompt()}

## Wiring recipes (use these port pairs)
- Control flow chain: workflow-start.trigger → …trigger → … → terminal step (see stop rule below)
- Feed → logic: polymarket-feed.data → threshold.data; threshold.trigger → workflow-approve.trigger
- Feed → display: polymarket-feed.data → ui-table.data; polymarket-feed.data → ui-label.data
- Logic → approve: threshold.trigger or if-condition.trigger → workflow-approve.trigger
- Approve → action: workflow-approve.trigger → policy-gate.trigger → polymarket-place-market.trigger
- Market context → PM order: polymarket-feed.market → polymarket-place-market.market
- Action → stop: polymarket-place-market.data → workflow-stop.signal (NEVER action.data → workflow-stop.trigger)
- DeFi: workflow-start.trigger → wallet-balance.trigger → lifi-quote.trigger → lifi-swap.trigger → workflow-stop.trigger
- order_intent path: lifi-quote.order_intent → policy-gate.order_intent → lifi-swap.order_intent
- Dual thresholds (buy/sell): polymarket-feed.data → each threshold.data; each threshold.trigger → its if-condition.trigger
- Compare node: two separate data sources into compare (both target_port data) — never wire threshold.signal into compare
- UI monitor: ui-table.signal → ui-label.signal (never ui-table.signal → ui-label.data)

## NEVER signal → data (invalid — add_edge will reject)
- threshold.signal → ui-table.data / ui-label.data / compare.data / if-condition.data
- compare.signal → if-condition.data / ui-label.data
- ui-table.signal → ui-label.data (use ui-label.signal instead)
- Use threshold.trigger for trade/approve paths; threshold.signal only to if-condition.signal or workflow-stop.signal

## Polymarket sports auto-trading (7-node template)
Nodes: workflow-start, polymarket-feed, threshold, workflow-approve, policy-gate, polymarket-place-market, workflow-stop
Edges:
${sportsEdges}
Notes: polymarket-feed is a source (no trigger input). workflow-start.trigger enters via workflow-approve.trigger. Completing the run uses action.data → workflow-stop.signal, not .trigger.

## Workflow rules
1. Every workflow needs workflow-start (or schedule-cron) AND workflow-stop on a connected path.
2. Insert workflow-approve before the first irreversible Live action unless user pre-authorized unattended execution.
3. Insert policy-gate before Live action nodes; dry-run-gate when user asks for testable flows.
4. Default Polymarket flow: workflow-start → workflow-approve (trigger) + polymarket-feed (data) → threshold → workflow-approve → policy-gate → polymarket-place-market → workflow-stop (signal).
5. Feed nodes (polymarket-feed, polymarket-orderbook) have no trigger input — wire feed.data to threshold/if-condition.data; never start.trigger → polymarket-feed.
6. Call complete only when nodes AND edges satisfy the user's request.

## Polymarket market configuration (MANDATORY)
- When the user mentions a market, event, league, or team: call search_polymarket_markets FIRST, then patch_node on polymarket-feed / polymarket-market with config.asset_id, config.market, config.outcome, config.depth.
- If the user supplies a CLOB token id explicitly, patch config.asset_id directly (still set config.market for the label).
- Only tell the user to pick a market in the UI when search_polymarket_markets returns zero results.
- Extract threshold bounds, order size/side/outcome, and approve messages from the user's design — never leave action or logic nodes with empty config.

${formatBuilderConfigPromptSection()}

## Edit mode (existing graph + modification request)
When the graph already has nodes and the user asks to change, update, or set values on existing steps:
- Use patch_node ONLY on matching nodes (by id from the graph summary or user-selected node).
- Patch ONLY node types implied by the user's message (e.g. order size → polymarket-place-market; threshold → threshold). Do NOT patch policy-gate, ui-table, or polymarket-feed unless the user explicitly mentions policy, display, or market/event changes.
- policy-gate policy_mode accepts inherit | override ONLY — never live, dry_run, or other runtime modes.
- Do NOT call add_node to duplicate workflow-start, polymarket-feed, threshold, or order nodes.
- Do NOT call search_polymarket_markets unless the user changes the market/event OR the feed node has no asset_id.
- After patch-only edits, call complete immediately if the graph is still connected and config is valid — no need to re-add edges or re-patch unchanged nodes.

Use add_node, patch_node, add_edge, then complete. Only v1 catalog slugs from add_node.`;
}

export function validateBuilderGraphConnectivity(graph: CanvasGraph): string[] {
  const issues: string[] = [];

  if (graph.nodes.length >= 2 && graph.edges.length === 0) {
    issues.push("Graph has 2+ nodes but zero edges — call add_edge to connect every step before complete.");
    return issues;
  }

  if (graph.nodes.length === 0) {
    issues.push("Graph has no nodes.");
    return issues;
  }

  const incident = new Map<string, number>();
  for (const node of graph.nodes) {
    incident.set(node.id, 0);
  }
  for (const edge of graph.edges) {
    incident.set(edge.source.node_id, (incident.get(edge.source.node_id) ?? 0) + 1);
    incident.set(edge.target.node_id, (incident.get(edge.target.node_id) ?? 0) + 1);
  }

  const displayOnly = new Set<CanvasNodeType>(["ui_label", "ui_panel"]);

  for (const node of graph.nodes) {
    if ((incident.get(node.id) ?? 0) === 0 && graph.nodes.length > 1 && !displayOnly.has(node.type)) {
      issues.push(
        `Node ${node.id} (${nodeTypeToSlug(node.type)}) has no edges — connect it with add_edge.`,
      );
    }
  }

  const entryTypes = new Set<CanvasNodeType>(["workflow_start", "schedule_cron"]);
  const entries = graph.nodes.filter((n) => entryTypes.has(n.type));
  if (entries.length === 0) {
    issues.push("Missing entry node: add workflow-start or schedule-cron.");
  } else {
    for (const entry of entries) {
      const hasOutgoing = graph.edges.some((e) => e.source.node_id === entry.id);
      if (!hasOutgoing) {
        issues.push(
          `Entry node ${entry.id} (${nodeTypeToSlug(entry.type)}) has no outgoing edge — connect trigger port downstream.`,
        );
      }
    }
  }

  const stops = graph.nodes.filter((n) => n.type === "workflow_stop");
  if (stops.length === 0) {
    issues.push("Missing workflow-stop terminal node.");
  } else {
    for (const stop of stops) {
      const hasIncoming = graph.edges.some((e) => e.target.node_id === stop.id);
      if (!hasIncoming) {
        issues.push(
          `Stop node ${stop.id} has no incoming edge — connect upstream trigger to workflow-stop.trigger.`,
        );
      }
    }
  }

  return issues;
}
