import type { CanvasNodeType } from "../graph/canvas-graph.types.js";
import type { DryRunNodeHandler } from "./nodes/workflow-nodes.js";
import {
  executeCompare,
  executeDryRunGate,
  executeIfCondition,
  executeNotify,
  executePassthroughData,
  executePolicyGate,
  executeSimulatedAction,
  executeThreshold,
  executeUiBinding,
  executeWorkflowApprove,
  executeWorkflowStart,
  executeWorkflowStop,
} from "./nodes/workflow-nodes.js";

const ACTION_TYPES = new Set<CanvasNodeType>([
  "place_order",
  "polymarket_place_limit",
  "polymarket_place_market",
  "polymarket_cancel_order",
  "lifi_swap",
  "lifi_bridge",
  "lifi_quote",
  "copy_trade",
  "swap_bridge",
]);

const DATA_READ_TYPES = new Set<CanvasNodeType>([
  "price_chart",
  "polymarket_feed",
  "polymarket_orderbook",
  "polymarket_positions",
  "wallet_balance",
  "whale_tx_tracker",
  "limitless_feed",
]);

const UI_TYPES = new Set<CanvasNodeType>([
  "ui_button",
  "ui_label",
  "ui_table",
  "ui_chart",
  "ui_panel",
]);

export function resolveDryRunHandler(resolvedType: CanvasNodeType): DryRunNodeHandler {
  switch (resolvedType) {
    case "workflow_start":
      return executeWorkflowStart;
    case "workflow_approve":
      return executeWorkflowApprove;
    case "workflow_stop":
      return executeWorkflowStop;
    case "if_condition":
      return executeIfCondition;
    case "compare":
      return executeCompare;
    case "threshold":
      return executeThreshold;
    case "dry_run_gate":
      return executeDryRunGate;
    case "policy_gate":
      return executePolicyGate;
    case "notify":
      return executeNotify;
    default:
      if (ACTION_TYPES.has(resolvedType)) return executeSimulatedAction;
      if (UI_TYPES.has(resolvedType)) return executeUiBinding;
      if (DATA_READ_TYPES.has(resolvedType)) return executePassthroughData;
      return executePassthroughData;
  }
}

export type {
  DryRunNodeContext,
  DryRunNodeHandler,
  DryRunNodeResult,
  NodePortOutputs,
} from "./nodes/workflow-nodes.js";
