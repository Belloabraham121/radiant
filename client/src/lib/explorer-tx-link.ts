import type { AgentChainId } from "@/lib/agent-chains";
import { chainExplorerLabel, chainExplorerTxUrl } from "@/lib/chain-meta";
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

export function explorerLinkLabel(
  step?: { id: string; label: string; chainId?: AgentChainId; evmChainId?: number },
): string {
  const chainId = step?.chainId ?? "sui";
  const flashLoan = step ? isFlashLoanExecutionStep(step) : false;
  return chainExplorerLabel(chainId, step?.evmChainId, { flashLoan });
}

export function explorerUrlForDigest(
  digest: string | undefined,
  chainId?: AgentChainId,
  evmChainId?: number,
): string | null {
  if (!digest || !chainId) {
    return null;
  }
  return chainExplorerTxUrl(chainId, digest, evmChainId);
}

export function explorerLinkLabelForReceipt(
  label: string,
  chainId: AgentChainId = "sui",
  evmChainId?: number,
): string {
  return chainExplorerLabel(chainId, evmChainId, {
    flashLoan: label === "Flash loan executed",
  });
}

export function flashLoanExecutedReceiptLabel(step: ExecutionStep): string {
  return isFlashLoanExecutionStep(step) ? "Flash loan executed" : "Transaction sent";
}

export function explorerLinkLabelForActivityCategory(
  category: AgentTransactionCategory,
  options?: { compact?: boolean; chainId?: AgentChainId; evmChainId?: number },
): string {
  const chainId = options?.chainId ?? "sui";
  return chainExplorerLabel(chainId, options?.evmChainId, {
    compact: options?.compact,
    flashLoan: category === "flash_loan",
  });
}

export function resolveActivityExplorerUrl(input: {
  explorer_url?: string | null;
  digest?: string | null;
  chain_id?: AgentChainId;
  evm_chain_id?: number;
}): string | null {
  if (input.explorer_url) {
    return input.explorer_url;
  }
  if (!input.digest || !input.chain_id) {
    return null;
  }
  return explorerUrlForDigest(input.digest, input.chain_id, input.evm_chain_id);
}
