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

function isToolError(result: unknown): result is AgentToolErrorResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof (result as AgentToolErrorResult).error?.message === "string"
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

  return `Tx digest: ${outcome.result.digest}`;
}
