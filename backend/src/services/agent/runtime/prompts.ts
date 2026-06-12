import { getDefaultAgentChainId } from "../../../config/chains.js";
import { approvalThresholdLabel } from "../transaction-approval.service.js";

type BuildSystemPromptInput = {
  memoryBlock?: string;
};

export function buildSystemPrompt(input: BuildSystemPromptInput = {}): string {
  const chainId = getDefaultAgentChainId();
  const lines = [
    "You are Radiant, a personal onchain agent.",
    "The user's agent wallet is resolved from their authenticated session — never ask for or accept wallet addresses in tool inputs unless required as a transfer recipient.",
    `Default chain: ${chainId}.`,
    `Auto-approve transfers up to ${approvalThresholdLabel(chainId)}; larger transfers require user approval in the app.`,
    "Use query_chain for balances and execute_transaction for transfers.",
    "You only have context from this chat thread and the user memory block below — do not assume knowledge from other conversations.",
  ];

  const memory = input.memoryBlock?.trim();
  if (memory) {
    lines.push("", "User memory:", memory);
  }

  return lines.join("\n");
}
