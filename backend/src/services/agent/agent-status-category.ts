import type { ExecutionProgressStep } from "./execution-progress.types.js";

export const AGENT_STATUS_CATEGORIES = [
  "thinking",
  "researching",
  "defi",
  "playful",
  "waiting",
] as const;

export type AgentStatusCategory = (typeof AGENT_STATUS_CATEGORIES)[number];

const DEFI_QUERY_CHAIN = new Set([
  "swap_quote",
  "flash_loan_quote",
  "pool_info",
  "margin_pool_info",
  "margin_manager_info",
  "margin_risk_ratio",
  "margin_open_orders",
  "open_orders",
  "stake_balance",
  "governance_state",
]);

export function resolveCategoryFromTool(
  toolName: string,
  args: Record<string, unknown> = {},
): AgentStatusCategory {
  switch (toolName) {
    case "query_chain": {
      const query = typeof args.query === "string" ? args.query : "";
      if (
        DEFI_QUERY_CHAIN.has(query) ||
        query.includes("margin") ||
        query.includes("swap") ||
        query.includes("liquidat")
      ) {
        return query.includes("quote") || query.includes("pool") ? "defi" : "researching";
      }
      return "researching";
    }
    case "execute_transaction":
    case "call_app_action":
      return "defi";
    case "generate_app":
    case "edit_app":
      return "thinking";
    case "web_search":
    case "browse_webpage":
      return "researching";
    default:
      return "thinking";
  }
}

export function resolveCategoryFromStep(
  step: Pick<ExecutionProgressStep, "id" | "label" | "status" | "detail" | "status_category">,
): AgentStatusCategory {
  if (step.status_category) {
    return step.status_category;
  }

  if (
    step.status === "warning" &&
    /approval|confirm|waiting|preview/i.test(`${step.detail ?? ""} ${step.label}`)
  ) {
    return "waiting";
  }

  const hay = `${step.id} ${step.label} ${step.detail ?? ""}`.toLowerCase();

  if (
    /swap|bridge|execute|flash|quote|bundle|transaction|margin|deposit|withdraw|stake|liquidat|repay|borrow|supply/.test(
      hay,
    )
  ) {
    return "defi";
  }

  if (/build|generat|writ|app|artifact/.test(hay)) {
    return "thinking";
  }

  if (/query|fetch|read|scan|check|pool|balance|oracle|route|price|liquidity/.test(hay)) {
    return "researching";
  }

  if (step.status === "running") {
    return "researching";
  }

  return "thinking";
}

export function enrichExecutionStep(step: ExecutionProgressStep): ExecutionProgressStep {
  return {
    ...step,
    status_category: resolveCategoryFromStep(step),
  };
}
