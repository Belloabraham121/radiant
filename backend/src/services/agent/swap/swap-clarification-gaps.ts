import { getEnabledEvmChainIds } from "../../../config/evm.js";
import { getEnabledChainConfigs } from "../../../config/chains.js";
import { getEvmNetwork } from "../../../config/evm.js";
import {
  formatAmbiguousAmountQuestion,
  isAmountUnitAmbiguous,
  parseUserAmount,
} from "../../market/resolve-user-amount.js";
import type { ClarificationAnswer, ClarificationGap } from "../workflow/clarification.types.js";
import type { PartialSwapIntent, SwapIntentField } from "./swap-intent.types.js";
import { SWAP_KNOWN_COINS } from "./swap-intent.types.js";
import { isSwapIntentComplete, withDefaultChain } from "./swap-intent-parser.js";
import {
  detectCrossChainSwapIntent,
  formatCrossChainBridgeConfirmQuestion,
} from "./token-chain-affinity.js";

function coinOptions(exclude?: string) {
  return SWAP_KNOWN_COINS.filter((symbol) => symbol !== exclude).map((symbol) => ({
    id: symbol,
    label: symbol,
  }));
}

function buildChainOptions(): Array<{ id: string; label: string }> {
  const options: Array<{ id: string; label: string }> = [];
  const enabled = getEnabledChainConfigs().filter((config) => config.enabled);

  for (const config of enabled) {
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
      options.push({ id: "chain:sui", label: "Sui (DeepBook)" });
    } else if (config.id === "solana") {
      options.push({ id: "chain:solana", label: "Solana" });
    } else if (config.id === "stellar") {
      options.push({ id: "chain:stellar", label: "Stellar" });
    }
  }

  return options;
}

function needsChainChoice(intent: PartialSwapIntent): boolean {
  if (intent.chainId) {
    if (intent.chainId === "ethereum" && intent.evmChainId === undefined) {
      return getEnabledEvmChainIds().length > 1;
    }
    return false;
  }
  const chainOptions = buildChainOptions();
  return chainOptions.length > 1;
}

function formatIntentPreview(intent: PartialSwapIntent): string {
  const parts: string[] = ["Swap intent so far:"];
  if (intent.inputCoin) {
    parts.push(`  Pay with: ${intent.inputCoin}`);
  }
  if (intent.outputCoin) {
    parts.push(`  Receive: ${intent.outputCoin}`);
  }
  if (intent.amount !== undefined) {
    const side = intent.amountSide === "receive" ? "receive" : "pay";
    const unit = intent.amountUnit ?? "token";
    const unitLabel = unit === "usd" ? "USD" : side === "receive" ? intent.outputCoin : intent.inputCoin;
    parts.push(`  Amount (${side}, ${unit}): ${intent.amount}${unitLabel ? ` ${unitLabel}` : ""}`);
  }
  if (intent.chainId) {
    if (intent.chainId === "ethereum" && intent.evmChainId !== undefined) {
      const network = getEvmNetwork(intent.evmChainId);
      parts.push(`  Network: ${network?.name ?? intent.evmChainId}`);
    } else {
      parts.push(`  Network: ${intent.chainId}`);
    }
  }
  return parts.join("\n");
}

/** First missing or ambiguous swap slot to clarify. */
export function collectSwapClarificationGap(intent: PartialSwapIntent): ClarificationGap | null {
  const filled = withDefaultChain(intent);

  if (!filled.inputCoin) {
    return {
      gap_id: "swap.input_coin",
      interaction_type: "single_choice",
      question: "Which token are you swapping from?",
      hint: "Pick the token you want to pay with.",
      step_index: 0,
      field: "input_coin",
      action: "swap",
      kind: "intent",
      options: coinOptions(filled.outputCoin),
    };
  }

  if (!filled.outputCoin) {
    return {
      gap_id: "swap.output_coin",
      interaction_type: "single_choice",
      question: `What should you receive in exchange for ${filled.inputCoin}?`,
      hint: "Pick the output token for this swap.",
      step_index: 0,
      field: "output_coin",
      action: "swap",
      kind: "intent",
      options: coinOptions(filled.inputCoin),
    };
  }

  if (filled.inputCoin === filled.outputCoin) {
    return {
      gap_id: "swap.output_coin",
      interaction_type: "single_choice",
      question: `You can't swap ${filled.inputCoin} into itself. What token should you receive?`,
      step_index: 0,
      field: "output_coin",
      action: "swap",
      kind: "intent",
      options: coinOptions(filled.inputCoin),
    };
  }

  if (filled.amount === undefined) {
    return {
      gap_id: "swap.amount",
      interaction_type: "input",
      question: `How much ${filled.inputCoin} should I swap for ${filled.outputCoin}?`,
      hint: `Enter amount in ${filled.inputCoin} or USD (e.g. 0.01 ${filled.inputCoin} or $10).`,
      step_index: 0,
      field: "amount",
      action: "swap",
      kind: "intent",
      input_kind: "text",
      placeholder: `e.g. 0.01 ${filled.inputCoin} or $10`,
    };
  }

  const amountUnit = filled.amountUnit ?? "token";
  if (
    !filled.amountUnitConfirmed &&
    isAmountUnitAmbiguous(filled.amount, amountUnit, filled.inputCoin)
  ) {
    return {
      gap_id: "swap.amount_unit",
      interaction_type: "single_choice",
      question: formatAmbiguousAmountQuestion(filled.amount, filled.inputCoin!),
      step_index: 0,
      field: "amount_unit",
      action: "swap",
      kind: "intent",
      options: [
        {
          id: "usd",
          label: `$${filled.amount.toFixed(2)} worth of ${filled.inputCoin}`,
        },
        {
          id: "token",
          label: `${filled.amount} ${filled.inputCoin}`,
        },
      ],
    };
  }

  if (!filled.amountSide) {
    const unit = filled.amountUnit ?? "token";
    const payLabel =
      unit === "usd"
        ? `Pay $${filled.amount}`
        : `Pay ${filled.amount} ${filled.inputCoin}`;
    const receiveLabel =
      unit === "usd"
        ? `Receive $${filled.amount} worth of ${filled.outputCoin}`
        : `Receive ${filled.amount} ${filled.outputCoin}`;
    return {
      gap_id: "swap.amount_side",
      interaction_type: "single_choice",
      question: `Does ${filled.amount}${unit === "usd" ? " USD" : ""} refer to the amount you pay or the amount you receive?`,
      step_index: 0,
      field: "amount_side",
      action: "swap",
      kind: "intent",
      options: [
        { id: "pay", label: payLabel },
        { id: "receive", label: receiveLabel },
      ],
    };
  }

  if (needsChainChoice(filled)) {
    const options = buildChainOptions();
    if (options.length === 0) {
      return null;
    }
    return {
      gap_id: "swap.chain_id",
      interaction_type: "single_choice",
      question: "Which network should I use for this swap?",
      hint: "Pick where you want to receive the output token, or where your input token is held for a same-chain swap.",
      step_index: 0,
      field: "chain_id",
      action: "swap",
      kind: "intent",
      options,
    };
  }

  const crossChain = detectCrossChainSwapIntent(filled);
  if (crossChain) {
    return {
      gap_id: "swap.bridge_confirm",
      interaction_type: "confirm",
      question: formatCrossChainBridgeConfirmQuestion(crossChain),
      step_index: 0,
      field: "bridge_confirm",
      action: "swap",
      kind: "intent",
    };
  }

  return null;
}

export function swapIntentPreview(intent: PartialSwapIntent): string {
  return formatIntentPreview(withDefaultChain(intent));
}

export function applySwapClarificationAnswer(
  intent: PartialSwapIntent,
  gap: ClarificationGap,
  answer: ClarificationAnswer,
): PartialSwapIntent | null {
  const field = gap.field as SwapIntentField | undefined;
  if (!field) {
    return null;
  }

  const next = { ...intent };

  if (gap.interaction_type === "single_choice") {
    const selected = answer.selected_option_id;
    if (!selected) {
      return null;
    }

    if (field === "input_coin" || field === "output_coin") {
      next[field === "input_coin" ? "inputCoin" : "outputCoin"] = selected.toUpperCase();
      return next;
    }

    if (field === "amount_side") {
      if (selected === "pay" || selected === "receive") {
        next.amountSide = selected;
        return next;
      }
      return null;
    }

    if (field === "amount_unit") {
      if (selected === "usd" || selected === "token") {
        next.amountUnit = selected;
        next.amountUnitConfirmed = true;
        return next;
      }
      return null;
    }

    if (field === "chain_id") {
      if (selected.startsWith("evm:")) {
        const parsed = Number.parseInt(selected.slice(4), 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          return null;
        }
        next.chainId = "ethereum";
        next.evmChainId = parsed;
        return next;
      }
      if (selected.startsWith("chain:")) {
        const chain = selected.slice(6);
        if (chain === "sui" || chain === "solana" || chain === "stellar" || chain === "ethereum") {
          next.chainId = chain;
          return next;
        }
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
    if (!next.amountSide) {
      next.amountSide = "pay";
    }
    return next;
  }

  return null;
}

export function swapIntentReadyForExecute(intent: PartialSwapIntent): boolean {
  return isSwapIntentComplete(withDefaultChain(intent));
}

export { withDefaultChain };
