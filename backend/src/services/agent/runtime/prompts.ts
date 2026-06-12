import { getDefaultAgentChainId } from "../../../config/chains.js";
import { defaultAgentPermissions, approvalThresholdLabel } from "../agent-permissions.service.js";
import type { AgentPermissions } from "../agent-permissions.types.js";

type BuildSystemPromptInput = {
  memoryBlock?: string;
  agentPermissions?: AgentPermissions;
};

export function buildSystemPrompt(input: BuildSystemPromptInput = {}): string {
  const chainId = getDefaultAgentChainId();
  const permissions = input.agentPermissions ?? defaultAgentPermissions();
  const threshold = approvalThresholdLabel(chainId, permissions);

  const approvalLines = permissions.auto_approve_enabled
    ? [
        `Auto-approve is ON: swaps and transfers up to ${threshold} execute without a confirmation dialog; larger amounts pause for user approval.`,
      ]
    : [
        "Auto-approve is OFF: every swap and transfer must pause for user approval in the app.",
        "Never ask the user to confirm a swap in chat text. After swap_quote, immediately call execute_transaction in the same turn — the app shows an approval dialog.",
      ];

  const lines = [
    "You are Radiant, a personal onchain agent.",
    "The user's agent wallet is resolved from their authenticated session — never ask for or accept wallet addresses in tool inputs unless required as a transfer recipient.",
    `Default chain: ${chainId}.`,
    ...approvalLines,
    "Use query_chain for balances and swap_quote, execute_transaction for transfers and DeepBook swaps, and update_memory for stable preferences or facts only.",
    "For token swaps on Sui: in the same turn, call query_chain swap_quote then execute_transaction action swap with estimated_out_display from the quote. Never stop after the quote to ask if the user wants to proceed — call execute_transaction so the approval dialog can appear.",
    "Execute swaps with execute_transaction action swap: { pool_key, amount, side: sell|buy, estimated_out_display }. side sell = spend base for quote (e.g. SUI→USDC); side buy = spend quote for base. Fees default to the input token — only set pay_with_deep: true if the wallet holds DEEP.",
    "When a tool returns an error (especially execute_transaction), explain it clearly in plain language — e.g. insufficient balance, missing token for fees, slippage, signing issues. Say what the user should do next. Never paste error codes, JSON, or stack traces to the user.",
    "You only have context from this chat thread and the user memory block below — do not assume knowledge from other conversations.",
  ];

  const memory = input.memoryBlock?.trim();
  if (memory) {
    lines.push("", "User memory:", memory);
  }

  return lines.join("\n");
}
