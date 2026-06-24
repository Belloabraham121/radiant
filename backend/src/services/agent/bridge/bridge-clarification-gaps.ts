import { getEnabledEvmChainIds } from "../../../config/evm.js";
import { getEnabledChainConfigs } from "../../../config/chains.js";
import { getEvmNetwork } from "../../../config/evm.js";
import { isLifiRadiantChain } from "../../../config/lifi-chains.js";
import type { ChainId } from "../../chains/types.js";
import type { ClarificationAnswer, ClarificationGap } from "../workflow/clarification.types.js";
import type { BridgeIntentField, PartialBridgeIntent } from "./bridge-intent.types.js";
import { BRIDGE_KNOWN_TOKENS } from "./bridge-intent.types.js";
import { parsePositiveNumber } from "../swap/text-tokenize.js";
import {
  isBridgeIntentComplete,
  needsSameTokenConfirmation,
  withDefaultBridgeChains,
} from "./bridge-intent-parser.js";

function tokenOptions(exclude?: string) {
  return BRIDGE_KNOWN_TOKENS.filter((symbol) => symbol !== exclude).map((symbol) => ({
    id: symbol,
    label: symbol,
  }));
}

function buildBridgeChainOptions(): Array<{ id: string; label: string }> {
  const options: Array<{ id: string; label: string }> = [];
  const enabled = getEnabledChainConfigs().filter((config) => config.enabled);

  for (const config of enabled) {
    if (!isLifiRadiantChain(config.id)) {
      continue;
    }
    if (config.id === "ethereum") {
      for (const evmChainId of getEnabledEvmChainIds()) {
        const network = getEvmNetwork(evmChainId);
        options.push({
          id: `evm:${evmChainId}`,
          label: network?.name ?? `EVM ${evmChainId}`,
        });
      }
      continue;
    }
    if (config.id === "sui") {
      options.push({ id: "chain:sui", label: "Sui" });
    } else if (config.id === "solana") {
      options.push({ id: "chain:solana", label: "Solana" });
    }
  }

  return options;
}

function needsEvmChainChoice(chainId?: ChainId, evmChainId?: number): boolean {
  if (chainId !== "ethereum") {
    return false;
  }
  return evmChainId === undefined && getEnabledEvmChainIds().length > 1;
}

function formatChainLabel(chainId?: ChainId, evmChainId?: number): string {
  if (!chainId) {
    return "unknown";
  }
  if (chainId === "ethereum" && evmChainId !== undefined) {
    const network = getEvmNetwork(evmChainId);
    return network?.name ?? `EVM ${evmChainId}`;
  }
  return chainId;
}

function formatIntentPreview(intent: PartialBridgeIntent): string {
  const filled = withDefaultBridgeChains(intent);
  const parts: string[] = ["Bridge intent so far:"];
  if (filled.fromChainId) {
    parts.push(`  From: ${formatChainLabel(filled.fromChainId, filled.fromEvmChainId)}`);
  }
  if (filled.toChainId) {
    parts.push(`  To: ${formatChainLabel(filled.toChainId, filled.toEvmChainId)}`);
  }
  if (filled.fromToken) {
    parts.push(`  Send token: ${filled.fromToken}`);
  }
  if (filled.toToken) {
    parts.push(`  Receive token: ${filled.toToken}`);
  }
  if (filled.amount !== undefined) {
    parts.push(`  Amount: ${filled.amount}${filled.fromToken ? ` ${filled.fromToken}` : ""}`);
  }
  return parts.join("\n");
}

function applyChainSelection(
  intent: PartialBridgeIntent,
  field: "from_chain" | "to_chain",
  selected: string,
): PartialBridgeIntent | null {
  const next = { ...intent };

  if (selected.startsWith("evm:")) {
    const parsed = Number.parseInt(selected.slice(4), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return null;
    }
    if (field === "from_chain") {
      next.fromChainId = "ethereum";
      next.fromEvmChainId = parsed;
    } else {
      next.toChainId = "ethereum";
      next.toEvmChainId = parsed;
    }
    return next;
  }

  if (selected.startsWith("chain:")) {
    const chain = selected.slice(6);
    if (chain === "sui" || chain === "solana" || chain === "ethereum") {
      if (field === "from_chain") {
        next.fromChainId = chain;
      } else {
        next.toChainId = chain;
      }
      return next;
    }
  }

  return null;
}

/** First missing or ambiguous bridge slot to clarify. */
export function collectBridgeClarificationGap(intent: PartialBridgeIntent): ClarificationGap | null {
  const filled = withDefaultBridgeChains(intent);

  if (!filled.fromChainId || needsEvmChainChoice(filled.fromChainId, filled.fromEvmChainId)) {
    const options = buildBridgeChainOptions();
    if (options.length === 0) {
      return null;
    }
    return {
      gap_id: "bridge.from_chain",
      interaction_type: "single_choice",
      question: "Which network are you bridging from?",
      hint: "Pick the chain where your tokens currently are.",
      step_index: 0,
      field: "from_chain",
      action: "bridge",
      kind: "intent",
      options,
    };
  }

  if (!filled.toChainId || needsEvmChainChoice(filled.toChainId, filled.toEvmChainId)) {
    const options = buildBridgeChainOptions();
    if (options.length === 0) {
      return null;
    }
    return {
      gap_id: "bridge.to_chain",
      interaction_type: "single_choice",
      question: "Which network should receive the bridged tokens?",
      hint: "Pick the destination chain.",
      step_index: 0,
      field: "to_chain",
      action: "bridge",
      kind: "intent",
      options,
    };
  }

  if (!filled.fromToken) {
    return {
      gap_id: "bridge.from_token",
      interaction_type: "single_choice",
      question: `Which token should I bridge from ${formatChainLabel(filled.fromChainId, filled.fromEvmChainId)}?`,
      step_index: 0,
      field: "from_token",
      action: "bridge",
      kind: "intent",
      options: tokenOptions(filled.toToken),
    };
  }

  if (!filled.toToken) {
    return {
      gap_id: "bridge.to_token",
      interaction_type: "single_choice",
      question: `What should you receive on ${formatChainLabel(filled.toChainId, filled.toEvmChainId)}?`,
      hint: "Pick the destination token — don't assume it matches the source.",
      step_index: 0,
      field: "to_token",
      action: "bridge",
      kind: "intent",
      options: tokenOptions(filled.fromToken),
    };
  }

  if (needsSameTokenConfirmation(filled)) {
    return {
      gap_id: "bridge.confirm_same_token",
      interaction_type: "single_choice",
      question: `Do you want to receive ${filled.fromToken} on the destination chain, or a different token?`,
      step_index: 0,
      field: "to_token",
      action: "bridge",
      kind: "intent",
      options: [
        { id: filled.fromToken, label: `Receive ${filled.fromToken} on destination` },
        ...tokenOptions(filled.fromToken).filter((option) => option.id !== filled.fromToken),
      ],
    };
  }

  if (filled.amount === undefined) {
    return {
      gap_id: "bridge.amount",
      interaction_type: "input",
      question: `How much ${filled.fromToken} should I bridge to ${formatChainLabel(filled.toChainId, filled.toEvmChainId)}?`,
      step_index: 0,
      field: "amount",
      action: "bridge",
      kind: "intent",
      input_kind: "number",
      placeholder: "e.g. 2",
    };
  }

  return null;
}

export function bridgeIntentPreview(intent: PartialBridgeIntent): string {
  return formatIntentPreview(intent);
}

export function applyBridgeClarificationAnswer(
  intent: PartialBridgeIntent,
  gap: ClarificationGap,
  answer: ClarificationAnswer,
): PartialBridgeIntent | null {
  const field = gap.field as BridgeIntentField | undefined;
  if (!field) {
    return null;
  }

  const next = { ...intent };

  if (gap.interaction_type === "single_choice") {
    const selected = answer.selected_option_id;
    if (!selected) {
      return null;
    }

    if (field === "from_chain" || field === "to_chain") {
      return applyChainSelection(next, field, selected);
    }

    if (field === "from_token") {
      next.fromToken = selected.toUpperCase();
      return next;
    }

    if (field === "to_token") {
      next.toToken = selected.toUpperCase();
      if (next.fromToken && next.toToken.toUpperCase() === next.fromToken.toUpperCase()) {
        next.confirmSameToken = true;
      }
      return next;
    }
  }

  if (gap.interaction_type === "input" && field === "amount") {
    const raw = answer.value;
    const num =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? parsePositiveNumber(raw.trim())
          : undefined;
    if (num === undefined) {
      return null;
    }
    next.amount = num;
    return next;
  }

  return null;
}

export function bridgeIntentReadyForExecute(intent: PartialBridgeIntent): boolean {
  return isBridgeIntentComplete(withDefaultBridgeChains(intent));
}

export { withDefaultBridgeChains };
