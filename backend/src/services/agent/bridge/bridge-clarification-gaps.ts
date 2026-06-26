import { getEnabledEvmChainIds } from "../../../config/evm.js";
import { getEnabledChainConfigs } from "../../../config/chains.js";
import { getEvmNetwork } from "../../../config/evm.js";
import { isLifiRadiantChain } from "../../../config/lifi-chains.js";
import type { ChainId } from "../../chains/types.js";
import {
  formatAmbiguousAmountQuestion,
  isAmountUnitAmbiguous,
  parseUserAmount,
} from "../../market/resolve-user-amount.js";
import type { ClarificationAnswer, ClarificationGap } from "../workflow/clarification.types.js";
import type { BridgeIntentField, PartialBridgeIntent } from "./bridge-intent.types.js";
import { BRIDGE_KNOWN_TOKENS } from "./bridge-intent.types.js";
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
  if (chainId === "sui") {
    return "Sui";
  }
  if (chainId === "solana") {
    return "Solana";
  }
  return chainId;
}

function formatAmountSnippet(intent: PartialBridgeIntent): string | null {
  if (intent.amount === undefined) {
    return null;
  }
  if (intent.amountUnit === "usd") {
    return `$${intent.amount}`;
  }
  if (intent.fromToken) {
    return `${intent.amount} ${intent.fromToken}`;
  }
  return String(intent.amount);
}

/** Build a clarification question from what we already parsed — only ask about the missing piece. */
export function formatBridgeClarificationQuestion(
  intent: PartialBridgeIntent,
  field: BridgeIntentField,
): string {
  const filled = withDefaultBridgeChains(intent);
  const fromLabel = formatChainLabel(filled.fromChainId, filled.fromEvmChainId);
  const toLabel = formatChainLabel(filled.toChainId, filled.toEvmChainId);
  const amountSnippet = formatAmountSnippet(filled);

  switch (field) {
    case "from_chain": {
      const dest = filled.toChainId ? ` to ${toLabel}` : "";
      const token = filled.fromToken ? ` ${filled.fromToken}` : "";
      const amt = amountSnippet ? ` ${amountSnippet}` : "";
      return `Got it — bridge${amt}${token}${dest}. Which network are those tokens on now?`;
    }
    case "to_chain": {
      const src = filled.fromChainId ? ` from ${fromLabel}` : "";
      const token = filled.fromToken ? ` ${filled.fromToken}` : "";
      const amt = amountSnippet ? ` ${amountSnippet}` : "";
      return `Bridging${amt}${token}${src} — which network should receive them?`;
    }
    case "from_token":
      return amountSnippet
        ? `Bridging ${amountSnippet} from ${fromLabel} to ${toLabel} — which token are you sending?`
        : `Which token on ${fromLabel} should I bridge to ${toLabel}?`;
    case "to_token":
      return amountSnippet
        ? `Bridging ${amountSnippet} from ${fromLabel} to ${toLabel} — what token should arrive on ${toLabel}?`
        : `You're sending ${filled.fromToken} from ${fromLabel} to ${toLabel} — what should you receive there?`;
    case "confirm_same_token":
      return `You're bridging ${filled.fromToken} from ${fromLabel} to ${toLabel} — receive ${filled.fromToken} on ${toLabel}, or swap into something else?`;
    case "amount":
      return amountSnippet
        ? `How much more ${filled.fromToken} should I bridge to ${toLabel}?`
        : `How much ${filled.fromToken} should I bridge from ${fromLabel} to ${toLabel}?`;
    case "amount_unit":
      return formatAmbiguousAmountQuestion(filled.amount!, filled.fromToken!);
    default:
      return "I need one more detail to run this bridge.";
  }
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
    const unit = filled.amountUnit ?? "token";
    const suffix =
      unit === "usd" ? " USD" : filled.fromToken ? ` ${filled.fromToken}` : "";
    parts.push(`  Amount: ${filled.amount}${suffix}`);
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
      question: formatBridgeClarificationQuestion(filled, "from_chain"),
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
      question: formatBridgeClarificationQuestion(filled, "to_chain"),
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
      question: formatBridgeClarificationQuestion(filled, "from_token"),
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
      question: formatBridgeClarificationQuestion(filled, "to_token"),
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
      question: formatBridgeClarificationQuestion(filled, "confirm_same_token"),
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
      question: formatBridgeClarificationQuestion(filled, "amount"),
      hint: `Enter amount in ${filled.fromToken} or USD (e.g. 0.5 ${filled.fromToken} or $10).`,
      step_index: 0,
      field: "amount",
      action: "bridge",
      kind: "intent",
      input_kind: "text",
      placeholder: `e.g. 0.5 ${filled.fromToken} or $10`,
    };
  }

  const amountUnit = filled.amountUnit ?? "token";
  if (
    !filled.amountUnitConfirmed &&
    isAmountUnitAmbiguous(filled.amount, amountUnit, filled.fromToken)
  ) {
    return {
      gap_id: "bridge.amount_unit",
      interaction_type: "single_choice",
      question: formatBridgeClarificationQuestion(filled, "amount_unit"),
      step_index: 0,
      field: "amount_unit",
      action: "bridge",
      kind: "intent",
      options: [
        {
          id: "usd",
          label: `$${filled.amount.toFixed(2)} worth of ${filled.fromToken}`,
        },
        {
          id: "token",
          label: `${filled.amount} ${filled.fromToken}`,
        },
      ],
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

    if (field === "amount_unit") {
      if (selected === "usd" || selected === "token") {
        next.amountUnit = selected;
        next.amountUnitConfirmed = true;
        return next;
      }
      return null;
    }
  }

  if (gap.interaction_type === "input" && field === "amount") {
    const raw = answer.value;
    const text =
      typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : undefined;
    if (!text) {
      return null;
    }
    const parsed = parseUserAmount(text);
    if (!parsed) {
      return null;
    }
    next.amount = parsed.value;
    next.amountUnit = parsed.unit;
    next.amountUnitConfirmed = parsed.unit === "usd";
    return next;
  }

  return null;
}

export function bridgeIntentReadyForExecute(intent: PartialBridgeIntent): boolean {
  return isBridgeIntentComplete(withDefaultBridgeChains(intent));
}

export { withDefaultBridgeChains };
