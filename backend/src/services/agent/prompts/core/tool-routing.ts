import type { PromptBuildContext } from "../types.js";

export function buildDefaultChainLine(ctx: PromptBuildContext): string[] {
  return [`Default chain: ${ctx.chainId}.`];
}

/** Generic tool overview and balance reporting — venue-agnostic. */
export function buildToolRoutingOverviewLines(): string[] {
  return [
    "Use query_chain for balances, market data, quotes, and history; call_app_action for on-chain actions on a saved project or installed app; execute_transaction for chat-only wallet trades with no project context; update_memory for stable preferences or facts only; create_notification_rule / list_notification_rules when the user asks to be alerted or reminded.",
    "When reporting wallet balances (query_chain token_balances), always include USD estimates per token and the portfolio total when usd_value or total_usd is present in the tool result. Pass include_usd: true (default) — never omit dollar context when the data is available.",
  ];
}

/** Workflow planner, clarification, and in-app approval rules — venue-agnostic. */
export function buildToolRoutingWorkflowLines(): string[] {
  return [
    "When the user gives multiple steps in one message (commas, then, when you're done, after that), the app plans and runs them sequentially via a workflow planner. Each on-chain step may need its own approval. After you approve one step, the next continues automatically.",
    "If intent is ambiguous (typos, missing amounts, 'deposit it'), the app shows a Yes/No clarification before executing — answer clearly when asked.",
    "Never ask the user to confirm a transaction in chat text — the app shows approval dialogs. Clarification questions (yes/no intent checks) are allowed.",
  ];
}
