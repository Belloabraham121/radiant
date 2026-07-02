import type { CanvasGraph, CanvasNode, CanvasNodeType } from "../graph/canvas-graph.types.js";
import { nodeTypeToSlug } from "../graph/node-slug-map.js";

/** Keys the Builder LLM must not persist (UI/catalog metadata). */
const INTERNAL_CONFIG_KEYS = new Set(["_catalog_slug"]);

/** Config fields commonly sent as strings from patch_node tool calls. */
const NUMERIC_PATCH_KEYS = new Set([
  "size",
  "value",
  "threshold",
  "price",
  "max_rows",
  "max_single_action_usd",
  "duration_seconds",
  "slippage_bps",
  "from_chain_id",
  "to_chain_id",
  "max_tokens",
  "b",
]);

/** Compact config field reference per Builder slug (mirrors client node-catalog keys). */
export const BUILDER_CONFIG_FIELDS: Record<string, readonly string[]> = {
  "workflow-approve": ["label", "message"],
  threshold: ["metric", "operator", "value"],
  "polymarket-feed": ["market", "asset_id", "outcome", "depth"],
  "polymarket-market": ["market", "asset_id", "outcome", "depth"],
  "polymarket-order": ["operation", "side", "size", "price", "outcome", "order_id"],
  "polymarket-place-market": ["side", "size", "outcome"],
  "polymarket-place-limit": ["side", "size", "price", "outcome"],
  "place-order": ["operation", "side", "size", "price", "outcome", "order_id"],
  "policy-gate": ["policy_mode"],
  "ui-table": ["title", "max_rows", "columns", "highlight_column"],
  "ui-label": ["label_text", "value_format", "prefix", "suffix"],
  "ui-chart": ["title", "chart_type"],
  "price-chart": ["pair", "interval", "chart_type"],
  "ai-reason": ["prompt", "max_tokens"],
  "schedule-cron": ["cron", "interval"],
  notify: ["channel", "message"],
  delay: ["duration_seconds"],
  "copy-trade": ["leader", "venue", "mirror_pct", "max_per_trade"],
  swap: ["from_chain_id", "to_chain_id", "from_token", "to_token", "slippage_bps"],
  bridge: ["from_chain_id", "to_chain_id", "from_token", "to_token", "slippage_bps"],
  "lifi-quote": ["from_chain_id", "to_chain_id", "from_token", "to_token", "slippage_bps"],
};

const POLYMARKET_FEED_TYPES = new Set<CanvasNodeType>([
  "polymarket_feed",
  "polymarket_orderbook",
  "limitless_feed",
]);

const ORDER_TYPES = new Set<CanvasNodeType>([
  "place_order",
  "polymarket_place_limit",
  "polymarket_place_market",
  "polymarket_cancel_order",
]);

const VALID_POLICY_MODES = new Set(["inherit", "override"]);

/** Node types with fixed palette display names — Builder must not set meta.label. */
export const PROTECTED_LABEL_NODE_TYPES = new Set<CanvasNodeType>([
  "workflow_start",
  "workflow_stop",
  "schedule_cron",
  "dry_run_gate",
  "workflow_pause",
  "workflow_resume",
]);

export function isProtectedNodeLabel(nodeType: CanvasNodeType): boolean {
  return PROTECTED_LABEL_NODE_TYPES.has(nodeType);
}

export function formatProtectedLabelSlugs(): string {
  return [...PROTECTED_LABEL_NODE_TYPES].map((t) => nodeTypeToSlug(t)).join(", ");
}

/** Remove custom meta.label from system nodes (catalog title is authoritative). */
export function stripProtectedNodeLabel(node: CanvasNode): CanvasNode {
  if (!isProtectedNodeLabel(node.type) || !node.meta?.label) {
    return node;
  }
  const { label: _removed, ...restMeta } = node.meta;
  const meta = Object.keys(restMeta).length > 0 ? restMeta : undefined;
  return { ...node, meta };
}

/** Slugs the Builder may patch in edit mode when the user message mentions them. */
const EDIT_SCOPE_ORDER_SLUGS = [
  "polymarket-place-market",
  "polymarket-place-limit",
  "polymarket-order",
  "place-order",
] as const;

const EDIT_SCOPE_THRESHOLD_SLUG = "threshold";
const EDIT_SCOPE_POLICY_SLUG = "policy-gate";
const EDIT_SCOPE_FEED_SLUGS = ["polymarket-feed", "polymarket-market"] as const;
const EDIT_SCOPE_UI_SLUGS = ["ui-table", "ui-label", "ui-chart"] as const;
const EDIT_SCOPE_APPROVE_SLUG = "workflow-approve";

function configHas(config: Record<string, unknown>, key: string): boolean {
  const v = config[key];
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return true;
}

function configNumber(config: Record<string, unknown>, key: string): number | null {
  const v = config[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function orderOperation(node: CanvasNode): string {
  const op = node.config.operation;
  if (typeof op === "string" && op.trim()) return op.trim();
  if (node.type === "polymarket_place_market") return "place_market";
  if (node.type === "polymarket_place_limit") return "place_limit";
  if (node.type === "polymarket_cancel_order") return "cancel";
  return "place_limit";
}

function validateNodeConfig(node: CanvasNode): string[] {
  const issues: string[] = [];
  const slug = nodeTypeToSlug(node.type);
  const cfg = node.config ?? {};

  if (POLYMARKET_FEED_TYPES.has(node.type)) {
    if (!configHas(cfg, "asset_id") && !configHas(cfg, "token_id") && !configHas(cfg, "market")) {
      issues.push(
        `${slug} ${node.id}: missing market config — call search_polymarket_markets then patch_node with config.asset_id and config.market.`,
      );
    }
  }

  if (node.type === "threshold") {
    const value = configNumber(cfg, "value") ?? configNumber(cfg, "threshold");
    if (value === null) {
      issues.push(
        `${slug} ${node.id}: missing threshold value — patch_node with config.metric, config.operator, config.value from the user's design.`,
      );
    }
  }

  if (ORDER_TYPES.has(node.type)) {
    const op = orderOperation(node);
    if (op === "cancel") {
      if (!configHas(cfg, "order_id")) {
        issues.push(`${slug} ${node.id}: cancel operation requires config.order_id.`);
      }
    } else {
      if (configNumber(cfg, "size") === null) {
        issues.push(
          `${slug} ${node.id}: missing order size — patch_node with config.side, config.size, config.outcome (and config.price for limit orders).`,
        );
      }
      if (op === "place_limit" && configNumber(cfg, "price") === null) {
        issues.push(`${slug} ${node.id}: place_limit requires config.price.`);
      }
    }
  }

  if (node.type === "ai_reason" && !configHas(cfg, "prompt")) {
    issues.push(`${slug} ${node.id}: missing config.prompt.`);
  }

  if (node.type === "schedule_cron" && !configHas(cfg, "cron") && !configHas(cfg, "interval")) {
    issues.push(`${slug} ${node.id}: set config.cron or config.interval.`);
  }

  if (node.type === "ui_label") {
    if (!configHas(cfg, "label_text") && !configHas(cfg, "label")) {
      issues.push(`${slug} ${node.id}: missing config.label_text.`);
    }
  }

  return issues;
}

function sanitizePolicyMode(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return "inherit";
  const normalized = value.trim().toLowerCase();
  if (VALID_POLICY_MODES.has(normalized)) return normalized;
  // LLM often sends runtime modes ("live", "dry_run") — policy_gate only accepts inherit | override
  return "inherit";
}

/** Sanitize every node config in a graph (coerce stale numeric strings, strip internal keys). */
export function sanitizeGraphNodeConfigs(graph: CanvasGraph): { graph: CanvasGraph; changed: boolean } {
  let changed = false;
  const nodes = graph.nodes.map((node) => {
    let next = node;
    const sanitized = sanitizeBuilderPatchConfig(node.type, node.config ?? {});
    const prev = node.config ?? {};
    if (JSON.stringify(sanitized) !== JSON.stringify(prev)) {
      changed = true;
      next = { ...next, config: sanitized };
    }
    const stripped = stripProtectedNodeLabel(next);
    if (stripped !== next) {
      changed = true;
      next = stripped;
    }
    return next;
  });
  return { graph: { ...graph, nodes }, changed };
}

/** Normalize LLM patch config before persist (coerce numeric strings, strip internal keys). */
export function sanitizeBuilderPatchConfig(
  nodeType: CanvasNodeType,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...config };
  for (const key of INTERNAL_CONFIG_KEYS) {
    delete out[key];
  }
  for (const key of NUMERIC_PATCH_KEYS) {
    if (!(key in out)) continue;
    const n = configNumber(out, key);
    if (n !== null) {
      out[key] = n;
    } else if (typeof out[key] === "string" && (out[key] as string).trim() === "") {
      delete out[key];
    }
  }
  if (nodeType === "policy_gate" || "policy_mode" in out) {
    if ("policy_mode" in out) {
      const sanitized = sanitizePolicyMode(out.policy_mode);
      if (sanitized !== undefined) {
        out.policy_mode = sanitized;
      } else {
        delete out.policy_mode;
      }
    }
  }
  return out;
}

/** Infer which catalog slugs are in scope for patch-only edits from the user message. */
export function inferEditPatchScopeSlugs(message: string): readonly string[] | null {
  const lower = message.toLowerCase();
  const slugs: string[] = [];

  const mentionsOrder =
    /\$\d+|\border size\b|\bsize to\b|\bplace[- ]?(market|limit)\b|\bmarket order\b|\blimit order\b|\bbuy\b|\bsell\b/.test(
      lower,
    );
  const mentionsThreshold =
    /\bthreshold\b|\bbound\b|\bcross(es|ing)?\b|<\s*[\d.]|\>\s*[\d.]|\bwhen (mid|price|value)\b/.test(
      lower,
    );
  const mentionsPolicy =
    /\bpolicy\b|\bpolicy_mode\b|\bmax.*action\b|\blive mode\b|\boverride policy\b/.test(lower);
  const mentionsFeed =
    /\b(market|event|team|league|asset_id|token_id|clob)\b/.test(lower) &&
    !/\bmarket order\b/.test(lower);
  const mentionsUi = /\b(table|ui-table|columns|display|chart)\b/.test(lower);
  const mentionsApprove = /\bapprove\b|\bconfirm\b|\bapproval message\b/.test(lower);

  if (mentionsOrder) slugs.push(...EDIT_SCOPE_ORDER_SLUGS);
  if (mentionsThreshold) slugs.push(EDIT_SCOPE_THRESHOLD_SLUG);
  if (mentionsPolicy) slugs.push(EDIT_SCOPE_POLICY_SLUG);
  if (mentionsFeed) slugs.push(...EDIT_SCOPE_FEED_SLUGS);
  if (mentionsUi) slugs.push(...EDIT_SCOPE_UI_SLUGS);
  if (mentionsApprove) slugs.push(EDIT_SCOPE_APPROVE_SLUG);

  if (slugs.length === 0) return null;
  return [...new Set(slugs)];
}

export function formatEditScopeHint(message: string): string {
  const slugs = inferEditPatchScopeSlugs(message);
  if (!slugs) return "";

  const skipDefaults = ["policy-gate", "ui-table", "polymarket-feed"].filter(
    (slug) => !slugs.includes(slug),
  );
  const lines = [
    `EDIT SCOPE: Patch ONLY these node types: ${slugs.join(", ")}.`,
  ];
  if (skipDefaults.length > 0) {
    lines.push(
      `Do NOT patch ${skipDefaults.join(", ")} unless the user explicitly mentioned them.`,
    );
  }
  if (!slugs.includes(EDIT_SCOPE_POLICY_SLUG)) {
    lines.push(
      "policy-gate: do NOT patch unless user mentions policy. Valid policy_mode: inherit | override only (never live/dry_run).",
    );
  }
  return lines.join(" ");
}

export function validateBuilderNodeConfig(graph: CanvasGraph): string[] {
  const issues: string[] = [];
  for (const node of graph.nodes) {
    issues.push(...validateNodeConfig(node));
  }
  return issues;
}

export function formatConfigCatalogForPrompt(): string {
  const lines: string[] = [];
  for (const [slug, fields] of Object.entries(BUILDER_CONFIG_FIELDS)) {
    lines.push(`  ${slug}: ${fields.join(", ")}`);
  }
  return lines.join("\n");
}

export function formatConfigPatchHint(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  const fields = BUILDER_CONFIG_FIELDS[normalized];
  if (!fields?.length) return "";
  return ` Config keys: ${fields.join(", ")} — set via add_node.config or patch_node before complete.`;
}

const SPORTS_PATCH_EXAMPLES = `## Config imputation examples (Polymarket sports auto-trade)
After add_node, patch_node BEFORE add_edge when the user supplied parameters:

1. polymarket-feed — search then patch:
   search_polymarket_markets({ q: "Chiefs vs Bills", category: "sports", tag: "nfl" })
   patch_node({ node_id: "<feed-id>", patch: { config: { market: "Chiefs vs Bills", asset_id: "<clob_token_id>", outcome: "yes", depth: "5" } } })

2. threshold — extract bound from user message:
   patch_node({ node_id: "<threshold-id>", patch: { config: { metric: "mid", operator: "<", value: 0.35 } } })

3. workflow-approve — human gate copy:
   patch_node({ node_id: "<approve-id>", patch: { config: { message: "Confirm trade when mid crosses threshold" } } })

4. polymarket-place-market — size/side from user:
   patch_node({ node_id: "<order-id>", patch: { config: { operation: "place_market", side: "buy", size: 50, outcome: "yes" } } })

Use patch: { config: { ... } } (not top-level keys). Re-run patch_node until validate passes, then add_edge, then complete.`;

export function formatBuilderConfigPromptSection(): string {
  return `## MANDATORY: Fill ALL node config before complete
Extract parameters from the user's message and apply them with add_node.config or patch_node.
Do NOT tell the user to pick markets in the UI unless search_polymarket_markets returns zero results.

Build order: add all nodes → patch_node for EVERY node that needs config → add_edge → validate → complete.

### Config field catalog (slug → keys)
${formatConfigCatalogForPrompt()}

${SPORTS_PATCH_EXAMPLES}`;
}
