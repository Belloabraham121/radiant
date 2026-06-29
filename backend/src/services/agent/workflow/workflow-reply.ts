import type { WalletAssetsData } from "../../wallet/wallet-assets.types.js";
import { formatWalletAssetsSummary } from "../../market/valuation.service.js";
import type { ToolCallRecord } from "../agent.types.js";
import { QUERY_CHAIN_TOOL_NAME } from "../query-chain.tool.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";
import type { CompletedWorkflowStep } from "./workflow.types.js";

function isWalletAssets(result: unknown): result is WalletAssetsData {
  return (
    typeof result === "object" &&
    result !== null &&
    "assets" in result &&
    Array.isArray((result as WalletAssetsData).assets)
  );
}

function formatWalletBalances(result: WalletAssetsData): string {
  return formatWalletAssetsSummary(result);
}

function formatQueryStepReply(toolCalls: ToolCallRecord[]): string | null {
  const queryCall = toolCalls.find((call) => call.name === QUERY_CHAIN_TOOL_NAME);
  if (!queryCall || typeof queryCall.result !== "object" || queryCall.result === null) {
    return null;
  }

  if ("error" in queryCall.result) {
    return null;
  }

  if (isWalletAssets(queryCall.result)) {
    return formatWalletBalances(queryCall.result);
  }

  if ("repay_feasible" in queryCall.result) {
    const quote = queryCall.result as {
      repay_feasible: boolean;
      borrow_amount_display?: number;
      asset?: string;
      pool_key?: string;
    };
    const amount = quote.borrow_amount_display ?? "?";
    const asset = quote.asset ?? "asset";
    const pool = quote.pool_key ?? "pool";
    return quote.repay_feasible
      ? `Flash loan quote on ${pool}: ${amount} ${asset} is repay-feasible.`
      : `Flash loan quote on ${pool}: ${amount} ${asset} is not repay-feasible — execution steps were skipped.`;
  }

  return null;
}

function formatExecuteStepReply(entry: CompletedWorkflowStep): string {
  const digest = entry.digest ? ` (digest: ${entry.digest})` : "";
  return `${entry.label}${digest}`;
}

export function synthesizeWorkflowCompletionReply(
  completed: CompletedWorkflowStep[],
  skipped: Array<{ index: number; label: string; reason: string }>,
): string {
  const executed = completed.filter((entry) => entry.status !== "skipped");
  const sections: string[] = [];

  if (executed.length > 0) {
    const lines = executed.map((entry, index) => {
      const queryDetail = formatQueryStepReply(entry.tool_calls);
      if (queryDetail) {
        return `${index + 1}. ${entry.label}\n${queryDetail}`;
      }
      return `${index + 1}. ${formatExecuteStepReply(entry)}`;
    });
    sections.push(`Completed ${executed.length} step(s):\n${lines.join("\n")}`);
  }

  if (skipped.length > 0) {
    const lines = skipped.map(
      (item) => `- Step ${item.index + 1} (${item.label}): ${item.reason}`,
    );
    sections.push(`Skipped ${skipped.length} step(s):\n${lines.join("\n")}`);
  }

  const hasPendingExecute = executed.some((entry) =>
    entry.tool_calls.some((call) => {
      if (call.name !== EXECUTE_TRANSACTION_TOOL_NAME) {
        return false;
      }
      return (
        typeof call.result === "object" &&
        call.result !== null &&
        "status" in call.result &&
        (call.result as { status: string }).status === "executed"
      );
    }),
  );

  if (sections.length === 0) {
    return "Workflow finished with no completed steps.";
  }

  if (hasPendingExecute && executed.length === 1) {
    return sections[0]!;
  }

  return sections.join("\n\n");
}
