import type { AgentChainId } from "@/lib/agent-chains";
import { chainExplorerTxUrl } from "@/lib/chain-meta";
import type { ExecutionStep } from "@/lib/chat-execution-steps";
import type { AgentTransactionCategory } from "@/lib/agent-transactions-api";

export function isFlashLoanExecutionStep(step: {
  id: string;
  label: string;
}): boolean {
  if (step.id !== "execute") {
    return false;
  }
  return /flash loan|execute bundle/i.test(step.label);
}

export function explorerLinkLabel(step?: { id: string; label: string }): string {
  return step && isFlashLoanExecutionStep(step)
    ? "View flash loan on Sui Explorer"
    : "View on Sui Explorer";
}

export function explorerUrlForDigest(
  digest: string | undefined,
  chainId: AgentChainId = "sui",
): string | null {
  if (!digest) {
    return null;
  }
  return chainExplorerTxUrl(chainId, digest);
}

export function explorerLinkLabelForReceipt(label: string): string {
  return label === "Flash loan executed"
    ? "View flash loan on Sui Explorer"
    : "View on Sui Explorer";
}

export function flashLoanExecutedReceiptLabel(step: ExecutionStep): string {
  return isFlashLoanExecutionStep(step) ? "Flash loan executed" : "Transaction sent";
}

export function explorerLinkLabelForActivityCategory(
  category: AgentTransactionCategory,
  options?: { compact?: boolean },
): string {
  if (options?.compact) {
    return "Explorer";
  }
  if (category === "flash_loan") {
    return "View flash loan on Sui Explorer";
  }
  return "View on Sui Explorer";
}

export function resolveActivityExplorerUrl(input: {
  explorer_url?: string | null;
  digest?: string | null;
  chain_id?: AgentChainId;
}): string | null {
  if (input.explorer_url) {
    return input.explorer_url;
  }
  return explorerUrlForDigest(input.digest ?? undefined, input.chain_id ?? "sui");
}
