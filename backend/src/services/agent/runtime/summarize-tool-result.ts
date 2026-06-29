import type { UpdateMemoryResult } from "../../memory/agent-memory.types.js";
import { toolErrorToModelContent } from "../../../utils/agent-tool-errors.js";
import { summarizeQueryChainResult, summarizeQueryChainResultAsync } from "./summarize-query-chain.js";
import type { AgentToolErrorResult } from "../tools.js";
import type { ExecuteToolOutcome } from "../agent.types.js";
import { isExecutePendingUserAction, pendingTransactionFromExecuteOutcome } from "../agent.types.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "../query-chain.tool.js";
import { UPDATE_MEMORY_TOOL_NAME } from "../update-memory.tool.js";
import type { TxResult } from "../../chains/types.js";

function isToolError(result: unknown): result is AgentToolErrorResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof (result as AgentToolErrorResult).error?.message === "string"
  );
}

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

export function formatExecutedTxSummary(result: TxResult): string {
  const digestPart = result.digest
    ? `Tx digest: ${result.digest}`
    : "Transaction succeeded (no digest — already provisioned on-chain).";

  const maintainer = result.deepbook?.margin_maintainer;
  if (maintainer?.action) {
    const coinPart = maintainer.coin_type ? ` for ${maintainer.coin_type}` : "";
    const poolPart = maintainer.pool_key ? ` on ${maintainer.pool_key}` : "";
    return `${digestPart} Margin maintainer ${maintainer.action.replace(/_/g, " ")}${coinPart}${poolPart}.`;
  }

  const margin = result.deepbook?.margin;
  if (!margin?.margin_manager && !margin?.supplier_cap && !margin?.referral_id) {
    return digestPart;
  }

  if (margin.action === "supply_pool" || margin.action === "withdraw_pool") {
    const capPart = margin.supplier_cap ?? margin.margin_manager;
    const amountPart = margin.amount != null ? ` ${margin.amount}` : "";
    const coinPart = margin.coin_type ?? margin.pool_key ?? "pool";
    return (
      `${digestPart} Margin pool ${margin.action.replace(/_/g, " ")}:${amountPart} ${coinPart}. ` +
      `SupplierCap: ${capPart}.`
    );
  }

  if (margin.action === "mint_supply_referral" && margin.referral_id) {
    return (
      `${digestPart} Minted margin supply referral for ${margin.pool_key ?? margin.coin_type ?? "pool"}. ` +
      `Referral ID: ${margin.referral_id}.`
    );
  }

  if (margin.action === "withdraw_referral_fees") {
    return `${digestPart} Withdrew margin pool referral fees for ${margin.pool_key ?? margin.coin_type ?? "pool"}.`;
  }

  if (!margin.margin_manager) {
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

export async function summarizeToolResultAsync(name: string, result: unknown): Promise<string> {
  if (name === QUERY_CHAIN_TOOL_NAME) {
    return (await summarizeQueryChainResultAsync(result)) ?? "Query completed.";
  }
  return summarizeToolResult(name, result);
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

  if (name === "web_search") {
    const outcome = result as {
      query: string;
      results: Array<{ title: string; url: string; snippet: string }>;
      rate_limit?: { remaining: number; limit: number; window: string };
    };
    if (!outcome.results?.length) {
      return `No results found for "${outcome.query}".`;
    }
    const items = outcome.results
      .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`)
      .join("\n\n");
    const rl = outcome.rate_limit;
    const rateLine = rl
      ? `\n\n[${rl.remaining}/${rl.limit} searches remaining this ${rl.window} — be efficient, prefer browse_webpage for follow-up reading]`
      : "";
    return `Search results for "${outcome.query}" (${outcome.results.length} results):\n\n${items}${rateLine}`;
  }

  if (name === "browse_webpage") {
    const outcome = result as { url: string; title: string; content: string; word_count: number };
    const preview = outcome.content.length > 6000
      ? outcome.content.slice(0, 6000) + "\n\n... (truncated)"
      : outcome.content;
    return `Page: ${outcome.title}\nURL: ${outcome.url}\nWords: ${outcome.word_count}\n\n${preview}`;
  }

  if (name === "call_api") {
    const outcome = result as {
      url: string;
      method: string;
      status: number;
      headers: Record<string, string>;
      body: string;
      truncated: boolean;
    };
    const bodyPreview = outcome.body.length > 8000
      ? outcome.body.slice(0, 8000) + "\n\n... (response truncated)"
      : outcome.body;
    const truncNote = outcome.truncated ? " (response was truncated)" : "";
    return `API ${outcome.method} ${outcome.url}\nStatus: ${outcome.status}${truncNote}\n\n${bodyPreview}`;
  }

  if (name !== EXECUTE_TRANSACTION_TOOL_NAME) {
    return "Done.";
  }

  const outcome = result as ExecuteToolOutcome;
  if (isExecutePendingUserAction(outcome)) {
    const pending = pendingTransactionFromExecuteOutcome(outcome);
    if (!pending) {
      return "Waiting for your response in the dialog.";
    }
    if (outcome.status === "liquidity_fallback_offered") {
      return `Alternate liquidity route available for ${pending.summary}. Review and accept or decline in the dialog.`;
    }
    const fiat = pending.fiat_preview;
    const fiatLine =
      fiat?.total_pay_usd != null && fiat.total_receive_usd != null
        ? ` (~$${fiat.total_pay_usd.toFixed(2)} → ~$${fiat.total_receive_usd.toFixed(2)})`
        : "";
    return `Approval required: ${pending.summary}${fiatLine}`;
  }

  if (outcome.status === "executed") {
    return formatExecutedTxSummary(outcome.result);
  }

  return "Done.";
}
