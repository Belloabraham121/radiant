import type { UpdateMemoryResult } from "../../memory/agent-memory.types.js";
import { toolErrorToModelContent } from "../../../utils/agent-tool-errors.js";
import { summarizeQueryChainResult } from "./summarize-query-chain.js";
import type { AgentToolErrorResult } from "../tools.js";
import type { ExecuteToolOutcome } from "../agent.types.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";
import { CALL_APP_ACTION_TOOL_NAME } from "../../projects/call-app-action.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "../query-chain.tool.js";
import { UPDATE_MEMORY_TOOL_NAME } from "../update-memory.tool.js";
import type { AppActionResult } from "../../projects/app-action.types.js";
import type { TxResult } from "../../chains/types.js";

function isToolError(result: unknown): result is AgentToolErrorResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof (result as AgentToolErrorResult).error?.message === "string"
  );
}

/** Short note for chat approval replies when a margin manager is involved. */
export function formatMarginManagerApprovalNote(result: TxResult): string {
  const margin = result.deepbook?.margin;
  if (!margin?.margin_manager) {
    return "";
  }
  const poolPart = margin.pool_key ? ` on ${margin.pool_key}` : "";
  return (
    ` Margin manager address: ${margin.margin_manager}${poolPart}. ` +
    `Use margin_manager_key "default" for follow-up margin actions.`
  );
}

/** Human- and model-readable summary after a successful on-chain execute. */
export function formatExecutedTxSummary(result: TxResult): string {
  const digestPart = result.digest
    ? `Tx digest: ${result.digest}`
    : "Transaction succeeded (no digest — already provisioned on-chain).";

  const margin = result.deepbook?.margin;
  if (!margin?.margin_manager) {
    return digestPart;
  }

  const poolPart = margin.pool_key ? ` on pool ${margin.pool_key}` : "";
  const actionPart = margin.action ? ` (${margin.action})` : "";
  return (
    `${digestPart}${actionPart}. Margin manager address: ${margin.margin_manager}${poolPart}. ` +
    `For follow-up margin actions use margin_manager_key: "default" — the platform resolves it from your wallet; ` +
    `you do not need to copy the address unless you want it for Sui Explorer.`
  );
}

export function summarizeToolResult(name: string, result: unknown): string {
  if (isToolError(result)) {
    return toolErrorToModelContent(result.error);
  }

  if (name === UPDATE_MEMORY_TOOL_NAME) {
    const outcome = result as UpdateMemoryResult;
    return `Memory updated: ${outcome.summary}`;
  }

  if (name === QUERY_CHAIN_TOOL_NAME) {
    return summarizeQueryChainResult(result) ?? "Query completed.";
  }

  if (name === CALL_APP_ACTION_TOOL_NAME) {
    const outcome = result as AppActionResult;
    if (outcome.status === "error") {
      return toolErrorToModelContent(outcome.error);
    }
    if (outcome.status === "approval_required") {
      return `Approval required: ${outcome.pending.summary}`;
    }
    if (outcome.status === "preview_delegated") {
      return outcome.message;
    }
    if (outcome.status === "executed") {
      return `Tx digest: ${outcome.digest}`;
    }
    return "Done.";
  }

  if (name !== EXECUTE_TRANSACTION_TOOL_NAME) {
    return "Done.";
  }

  const outcome = result as ExecuteToolOutcome;
  if (outcome.status === "approval_required") {
    return `Approval required: ${outcome.pending.summary}`;
  }

  return formatExecutedTxSummary(outcome.result);
}
