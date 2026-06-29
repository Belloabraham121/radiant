import type { CanvasNodeType } from "../graph/canvas-graph.types.js";
import type { CompiledWorkflowNode } from "../compiler/compiled-workflow.types.js";
import type { CanvasPolicy } from "../policy/canvas-policy.types.js";
import type { NodePortOutputs } from "./nodes/workflow-nodes.js";
import {
  executeCompare,
  executeIfCondition,
  executeNotify,
  executePassthroughData,
  executeThreshold,
  executeWorkflowApprove,
  executeWorkflowStart,
  executeWorkflowStop,
} from "./nodes/workflow-nodes.js";
import { executeLiveLifiAction, executeLivePolymarketOrder } from "./nodes/live-actions.js";
import { evaluateWorkflowAction } from "../policy/canvas-policy.service.js";
import { AppError } from "../../../errors/app-error.js";

export type LiveNodeResult = {
  outputs: NodePortOutputs;
  detail?: string;
  executed?: boolean;
  tx_hash?: string;
  explorer_url?: string;
  evm_chain_id?: number;
  fee_usd?: number;
  skipped?: boolean;
  warnings?: string[];
};

export type LiveNodeContext = {
  runId: string;
  workflowId: string;
  privyUserId: string;
  policy: CanvasPolicy;
  node: CompiledWorkflowNode;
  upstream: Map<string, unknown>;
  autoApprove: boolean;
};

export type LiveNodeHandler = (ctx: LiveNodeContext) => Promise<LiveNodeResult>;

const LIFI_TYPES = new Set<CanvasNodeType>(["lifi_swap", "lifi_bridge", "lifi_quote", "swap_bridge"]);
const PM_TYPES = new Set<CanvasNodeType>([
  "place_order",
  "polymarket_place_limit",
  "polymarket_place_market",
]);

async function executeLivePolicyGate(ctx: LiveNodeContext): Promise<LiveNodeResult> {
  let intentData: unknown = null;
  for (const [, value] of ctx.upstream) {
    if (value !== undefined) intentData = value;
  }

  const estUsd =
    typeof intentData === "object" && intentData && "est_usd" in intentData
      ? Number((intentData as { est_usd: unknown }).est_usd)
      : undefined;

  const evaluation = await evaluateWorkflowAction(ctx.workflowId, ctx.policy, {
    action_type: "lifi_swap",
    est_usd: estUsd,
  });

  if (!evaluation.allowed) {
    throw new AppError(403, evaluation.code, evaluation.message);
  }

  return {
    outputs: {
      trigger: { allowed: true, live: true },
      order_intent: intentData ?? {},
    },
    detail: "Policy gate passed",
  };
}

function wrapDryRunAsLive(handler: typeof executeWorkflowStart): LiveNodeHandler {
  return async (ctx) => {
    const result = await handler({
      runId: ctx.runId,
      node: ctx.node,
      upstream: ctx.upstream,
      autoApprove: ctx.autoApprove,
    });
    return {
      outputs: result.outputs,
      detail: result.detail,
      skipped: result.skipped,
      warnings: result.warnings,
    };
  };
}

export function resolveLiveHandler(resolvedType: CanvasNodeType): LiveNodeHandler {
  switch (resolvedType) {
    case "workflow_start":
      return wrapDryRunAsLive(executeWorkflowStart);
    case "workflow_approve":
      return wrapDryRunAsLive(executeWorkflowApprove);
    case "workflow_stop":
      return wrapDryRunAsLive(executeWorkflowStop);
    case "if_condition":
      return wrapDryRunAsLive(executeIfCondition);
    case "compare":
      return wrapDryRunAsLive(executeCompare);
    case "threshold":
      return wrapDryRunAsLive(executeThreshold);
    case "policy_gate":
      return executeLivePolicyGate;
    case "notify":
      return wrapDryRunAsLive(executeNotify);
    default:
      if (PM_TYPES.has(resolvedType)) return executeLivePolymarketOrder;
      if (LIFI_TYPES.has(resolvedType)) return executeLiveLifiAction;
      return wrapDryRunAsLive(executePassthroughData);
  }
}
