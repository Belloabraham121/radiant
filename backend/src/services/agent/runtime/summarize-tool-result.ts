import type { UpdateMemoryResult } from "../../memory/agent-memory.types.js";
import { toolErrorToModelContent } from "../../../utils/agent-tool-errors.js";
import { summarizeQueryChainResult, summarizeQueryChainResultAsync } from "./summarize-query-chain.js";
import type { AgentToolErrorResult } from "../tools.js";
import type { ExecuteToolOutcome } from "../agent.types.js";
import { EXECUTE_TRANSACTION_TOOL_NAME } from "../execute-transaction.tool.js";
import { CALL_APP_ACTION_TOOL_NAME } from "../../projects/call-app-action.tool.js";
import { QUERY_CHAIN_TOOL_NAME } from "../query-chain.tool.js";
import { UPDATE_MEMORY_TOOL_NAME } from "../update-memory.tool.js";
import { LIST_PUBLIC_APPS_TOOL_NAME } from "../../projects/list-public-apps.tool.js";
import { INSTALL_APP_TOOL_NAME } from "../../projects/install-app.tool.js";
import type { AppActionResult } from "../../projects/app-action.types.js";
import type { TxResult } from "../../chains/types.js";

/**
 * Strip platform-injected CSS (.radiant-agent-indicator, .radiant-tx-approval-*, etc.)
 * from globals.css before showing it to the LLM. The agent shouldn't edit these styles,
 * and they bloat the file past the 3000-char truncation limit.
 */
function stripPlatformCssForSummary(css: string): string {
  const platformMarkers = [
    ".radiant-agent-indicator",
    ".radiant-agent-indicator-dot",
    "@keyframes radiant-agent-pulse",
    "[data-radiant-id].agent-focused",
    "[data-radiant-id].agent-clicking",
    ".radiant-tx-approval-",
  ];
  const lines = css.split("\n");
  const kept: string[] = [];
  let skip = false;
  let braceDepth = 0;
  for (const line of lines) {
    if (!skip && platformMarkers.some((m) => line.includes(m))) {
      skip = true;
      braceDepth = 0;
    }
    if (skip) {
      for (const ch of line) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }
      if (braceDepth <= 0) {
        skip = false;
        braceDepth = 0;
      }
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

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

function summarizeListPublicAppsResult(result: unknown): string {
  const catalog = result as {
    apps?: Array<{
      id: string;
      name: string;
      tagline: string;
      category: string;
      install_count: number;
    }>;
    stats?: { total_apps: number; total_installs: number };
    hint?: string;
  };
  const apps = catalog.apps ?? [];
  if (apps.length === 0) {
    return catalog.hint ?? "No public apps in the explorer yet.";
  }
  const lines = apps.map(
    (app) =>
      `- ${app.name} (${app.category}) — project_id: ${app.id} — ${app.tagline || "no tagline"} — ${app.install_count} install(s)`,
  );
  const total = catalog.stats?.total_apps ?? apps.length;
  const hint = catalog.hint ? `\n\n${catalog.hint}` : "";
  return `Public explorer apps (${total} total):\n\n${lines.join("\n")}${hint}`;
}

function summarizeInstallAppResult(result: unknown): string {
  if (isToolError(result)) {
    return toolErrorToModelContent(result.error);
  }
  const outcome = result as {
    installation_id?: string;
    already_installed?: boolean;
    app_name?: string;
    open_path?: string;
    message?: string;
  };
  if (outcome.message) {
    return outcome.message;
  }
  if (outcome.installation_id) {
    return `Installed. Open at ${outcome.open_path ?? `/app/installed/${outcome.installation_id}/run`}`;
  }
  return "Install completed.";
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

  if (name === CALL_APP_ACTION_TOOL_NAME) {
    const outcome = result as AppActionResult;
    if (outcome.status === "error") {
      return toolErrorToModelContent(outcome.error);
    }
    if (outcome.status === "approval_required") {
      const fiat = outcome.pending.fiat_preview;
      const fiatLine =
        fiat?.total_pay_usd != null && fiat.total_receive_usd != null
          ? ` (~$${fiat.total_pay_usd.toFixed(2)} → ~$${fiat.total_receive_usd.toFixed(2)})`
          : "";
      return `Approval required: ${outcome.pending.summary}${fiatLine}`;
    }
    if (outcome.status === "preview_delegated") {
      return outcome.message;
    }
    if (outcome.status === "executed") {
      return `Tx digest: ${outcome.digest}`;
    }
    return "Done.";
  }

  if (name === "generate_app" || name === "edit_app") {
    const outcome = result as {
      name?: string;
      revision?: number;
      files?: Array<{ path: string; content: string }>;
    };
    const fileList = outcome.files ?? [];
    const PLATFORM_FILES = new Set([
      "lib/radiant-client.ts",
      "lib/radiant-agent-runtime.ts",
      "components/AgentIndicator.tsx",
    ]);
    const userFiles = fileList.filter((f) => !PLATFORM_FILES.has(f.path));
    const platformCount = fileList.length - userFiles.length;

    const fileSummaries = userFiles.map((f) => {
      let content = f.content;
      if (f.path.endsWith("globals.css")) {
        content = stripPlatformCssForSummary(content);
      }
      const lines = content.split("\n");
      const preview = lines.join("\n");
      if (preview.length <= 3000) {
        return `--- ${f.path} (${lines.length} lines) ---\n${preview}`;
      }
      const truncated = preview.slice(0, 3000);
      return `--- ${f.path} (${lines.length} lines, truncated) ---\n${truncated}\n...`;
    });

    const verb = name === "edit_app" ? "Edits applied to" : "Built";
    const platformNote = platformCount > 0
      ? ` (+ ${platformCount} platform files omitted)`
      : "";
    return (
      `${verb} "${outcome.name ?? "App"}" (revision ${outcome.revision ?? 0}). ` +
      `${userFiles.length} user files${platformNote}. ` +
      `Full file contents below — use these EXACT strings as old_string when calling edit_app:\n\n` +
      fileSummaries.join("\n\n")
    );
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

  if (name === LIST_PUBLIC_APPS_TOOL_NAME || name === INSTALL_APP_TOOL_NAME) {
    return name === LIST_PUBLIC_APPS_TOOL_NAME
      ? summarizeListPublicAppsResult(result)
      : summarizeInstallAppResult(result);
  }

  if (name !== EXECUTE_TRANSACTION_TOOL_NAME) {
    return "Done.";
  }

  const outcome = result as ExecuteToolOutcome;
  if (outcome.status === "approval_required") {
    const fiat = outcome.pending.fiat_preview;
    const fiatLine =
      fiat?.total_pay_usd != null && fiat.total_receive_usd != null
        ? ` (~$${fiat.total_pay_usd.toFixed(2)} → ~$${fiat.total_receive_usd.toFixed(2)})`
        : "";
    return `Approval required: ${outcome.pending.summary}${fiatLine}`;
  }

  return formatExecutedTxSummary(outcome.result);
}
