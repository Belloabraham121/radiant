import type { WorkflowExecuteStep } from "./workflow/workflow.types.js";
import {
  inferSwapSideForPool,
  resolveSwapPoolKey,
} from "../defi/deepbook/pool-key.js";
import { parseSingleSwapIntent } from "./workflow/workflow-parser.js";

/** High-level instruction modes (matches system prompt routing). */
export type InstructionMode = "research" | "execution" | "build";

export type SwapExecutionIntent = {
  kind: "swap";
  amount: number;
  from_coin: string;
  to_coin: string;
  pool_key: string;
  side: "buy" | "sell";
  execute: WorkflowExecuteStep;
};

const BUILD_PATTERN =
  /\b(build|create|make|design|develop|implement|generate)\b.*\b(app|ui|interface|dashboard|page|component|swap\s+app|dex)\b/i;

const SWAP_EXECUTION_PATTERN =
  /\b(swap|convert|trade|exchange)\b[\s\S]*?\d/i;

/** Rough mode detection for logging and guardrails — LLM still sees full system prompt. */
export function detectInstructionMode(message: string): InstructionMode {
  const trimmed = message.trim();
  if (BUILD_PATTERN.test(trimmed)) {
    return "build";
  }
  if (SWAP_EXECUTION_PATTERN.test(trimmed)) {
    return "execution";
  }
  return "research";
}

/** Deterministic swap execution intent — pool key and side resolved before any LLM tool calls. */
export function parseSwapExecutionIntent(message: string): SwapExecutionIntent | null {
  const step = parseSingleSwapIntent(message);
  if (!step) {
    return null;
  }

  const params = step.input.params as Record<string, unknown>;
  const from = typeof params.input_coin === "string" ? params.input_coin : null;
  const to = typeof params.output_coin === "string" ? params.output_coin : null;
  const amount = params.amount;
  if (!from || !to || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const explicitPool =
    typeof params.pool_key === "string" && params.pool_key.length > 0 ? params.pool_key : null;
  const pool_key = resolveSwapPoolKey({
    fromCoin: from,
    toCoin: to,
    explicitPoolKey: explicitPool,
  });
  const side = inferSwapSideForPool(from, to, pool_key);

  const execute: WorkflowExecuteStep = {
    ...step,
    input: {
      ...step.input,
      params: {
        ...params,
        pool_key,
        side,
        input_coin: from,
        output_coin: to,
        amount,
      },
    },
  };

  return {
    kind: "swap",
    amount,
    from_coin: from,
    to_coin: to,
    pool_key,
    side,
    execute,
  };
}
