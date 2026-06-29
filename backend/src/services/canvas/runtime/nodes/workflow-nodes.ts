import type { PortKind } from "../../graph/canvas-graph.types.js";
import type { CompiledWorkflowNode } from "../../compiler/compiled-workflow.types.js";

export type NodePortOutputs = Partial<Record<PortKind, unknown>>;

export type DryRunNodeResult = {
  outputs: NodePortOutputs;
  detail?: string;
  simulated?: boolean;
  skipped?: boolean;
  warnings?: string[];
};

export type DryRunNodeContext = {
  runId: string;
  node: CompiledWorkflowNode;
  /** Upstream port values keyed by `${nodeId}:${port}`. */
  upstream: Map<string, unknown>;
  autoApprove: boolean;
};

export type DryRunNodeHandler = (ctx: DryRunNodeContext) => Promise<DryRunNodeResult>;

function getUpstreamData(ctx: DryRunNodeContext): unknown {
  for (const edge of ctx.node.inputs) {
    if (edge.source.port === "data" || edge.target.port === "data") {
      const key = `${edge.source.node_id}:${edge.source.port}`;
      const value = ctx.upstream.get(key);
      if (value !== undefined) return value;
    }
  }
  for (const [, value] of ctx.upstream) {
    if (value !== undefined) return value;
  }
  return null;
}

function getUpstreamTrigger(ctx: DryRunNodeContext): boolean {
  for (const edge of ctx.node.inputs) {
    if (edge.source.port === "trigger" || edge.target.port === "trigger") {
      const key = `${edge.source.node_id}:${edge.source.port}`;
      if (ctx.upstream.get(key)) return true;
    }
  }
  return ctx.node.inputs.length === 0;
}

export const executeWorkflowStart: DryRunNodeHandler = async (ctx) => {
  const payload = {
    source: "dry_run",
    run_id: ctx.runId,
    started_at: new Date().toISOString(),
  };
  return {
    outputs: { trigger: payload },
    detail: "Workflow started (dry run)",
  };
};

export const executeWorkflowApprove: DryRunNodeHandler = async (ctx) => {
  if (!getUpstreamTrigger(ctx)) {
    return { outputs: {}, skipped: true, detail: "No upstream trigger" };
  }
  const preview = getUpstreamData(ctx);
  if (ctx.autoApprove) {
    return {
      outputs: {
        trigger: { approved: true, auto: true, preview },
      },
      detail: "Auto-approved (dry run)",
    };
  }
  return {
    outputs: {
      trigger: { approved: true, auto: true, preview },
    },
    detail: "Simulated approval",
  };
};

export const executeWorkflowStop: DryRunNodeHandler = async (ctx) => {
  const reason =
    typeof ctx.node.config.reason === "string" ? ctx.node.config.reason : "branch complete";
  return {
    outputs: {},
    detail: `Stopped: ${reason}`,
  };
};

export const executeIfCondition: DryRunNodeHandler = async (ctx) => {
  if (!getUpstreamTrigger(ctx)) {
    return { outputs: {}, skipped: true };
  }
  const data = getUpstreamData(ctx);
  const expression = ctx.node.config.expression;
  let result = Boolean(data);
  if (typeof expression === "string" && expression.trim()) {
    if (expression.includes("true")) result = true;
    else if (expression.includes("false")) result = false;
    else if (typeof data === "object" && data && "value" in data) {
      result = Boolean((data as { value: unknown }).value);
    }
  }
  return {
    outputs: { trigger: { branch: result ? "true" : "false", value: result } },
    detail: `IF → ${result}`,
  };
};

export const executeCompare: DryRunNodeHandler = async (ctx) => {
  const inputs = ctx.node.inputs.filter((e) => e.target.port === "data");
  const values: number[] = [];
  for (const edge of inputs) {
    const raw = ctx.upstream.get(`${edge.source.node_id}:${edge.source.port}`);
    const num = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(num)) values.push(num);
  }
  const operator = String(ctx.node.config.operator ?? ">");
  const a = values[0] ?? 0;
  const b = values[1] ?? Number(ctx.node.config.b ?? 0);
  let result = false;
  switch (operator) {
    case ">":
      result = a > b;
      break;
    case "<":
      result = a < b;
      break;
    case "==":
    case "=":
      result = a === b;
      break;
    case ">=":
      result = a >= b;
      break;
    case "<=":
      result = a <= b;
      break;
    default:
      result = a > b;
  }
  return {
    outputs: {
      signal: result,
      trigger: result ? { compared: true, a, b, operator } : undefined,
    },
    detail: `${a} ${operator} ${b} → ${result}`,
  };
};

export const executeThreshold: DryRunNodeHandler = async (ctx) => {
  const data = getUpstreamData(ctx);
  const threshold = Number(ctx.node.config.threshold ?? ctx.node.config.value ?? 0);
  const value =
    typeof data === "number"
      ? data
      : typeof data === "object" && data && "mid" in data
        ? Number((data as { mid: unknown }).mid)
        : Number(data);
  const operator = String(ctx.node.config.operator ?? "<");
  let crossed = false;
  if (operator === "<") crossed = value < threshold;
  else if (operator === ">") crossed = value > threshold;
  else crossed = Math.abs(value - threshold) < 0.0001;

  return {
    outputs: {
      trigger: crossed ? { crossed: true, value, threshold } : undefined,
      signal: { value, threshold, crossed },
    },
    detail: crossed ? `Threshold crossed (${value} ${operator} ${threshold})` : `Below threshold (${value})`,
  };
};

export const executeDryRunGate: DryRunNodeHandler = async (ctx) => {
  if (!getUpstreamTrigger(ctx)) {
    return { outputs: {}, skipped: true };
  }
  const intent = getUpstreamData(ctx);
  return {
    outputs: {
      trigger: { routed: "simulator" },
      order_intent: { ...(typeof intent === "object" && intent ? intent : {}), simulated: true },
    },
    detail: "Routed to dry-run simulator",
    simulated: true,
  };
};

export const executePolicyGate: DryRunNodeHandler = async (ctx) => {
  if (!getUpstreamTrigger(ctx)) {
    return { outputs: {}, skipped: true };
  }
  const intent = getUpstreamData(ctx);
  const warnings: string[] = [];
  const estUsd =
    typeof intent === "object" && intent && "est_usd" in intent
      ? Number((intent as { est_usd: unknown }).est_usd)
      : null;
  if (estUsd != null && estUsd > 100) {
    warnings.push(`Intent est_usd $${estUsd} may exceed policy cap in Live.`);
  }
  return {
    outputs: {
      trigger: { allowed: true, dry_run: true },
      order_intent: intent ?? {},
    },
    detail: warnings.length ? warnings.join(" ") : "Policy check passed (warning mode)",
    warnings,
  };
};

export const executeNotify: DryRunNodeHandler = async (ctx) => {
  const message =
    typeof ctx.node.config.message === "string"
      ? ctx.node.config.message
      : "Dry-run notification";
  return {
    outputs: { data: { delivered: false, simulated: true, message } },
    detail: `Notify (simulated): ${message}`,
    simulated: true,
  };
};

export const executeSimulatedAction: DryRunNodeHandler = async (ctx) => {
  if (!getUpstreamTrigger(ctx)) {
    return { outputs: {}, skipped: true };
  }
  const intent = getUpstreamData(ctx);
  const simulatedFill = {
    simulated: true,
    node_type: ctx.node.resolved_type,
    status: "filled",
    fill_price: 0.42,
    order_id: `sim-${ctx.runId.slice(0, 8)}`,
    intent,
  };
  return {
    outputs: { data: simulatedFill },
    detail: `Simulated ${ctx.node.resolved_type.replace(/_/g, " ")}`,
    simulated: true,
  };
};

export const executePassthroughData: DryRunNodeHandler = async (ctx) => {
  const data = getUpstreamData(ctx);
  return {
    outputs: {
      data: data ?? { preview: true, node: ctx.node.resolved_type },
      trigger: getUpstreamTrigger(ctx) ? { passthrough: true } : undefined,
    },
    detail: `Read ${ctx.node.resolved_type.replace(/_/g, " ")}`,
  };
};

export const executeUiBinding: DryRunNodeHandler = async (ctx) => {
  const data = getUpstreamData(ctx);
  const binding = {
    bound: true,
    display: data ?? ctx.node.config,
    node_type: ctx.node.resolved_type,
  };
  return {
    outputs: {
      data: binding,
      trigger: ctx.node.resolved_type === "ui_button" ? { click: "simulated" } : undefined,
    },
    detail: `UI binding updated (${ctx.node.resolved_type})`,
  };
};
