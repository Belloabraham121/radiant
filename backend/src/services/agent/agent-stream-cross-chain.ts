import type { ExecutionProgressStep, ExecutionStepStatus } from "./execution-progress.types.js";
import { emitAgentStreamExecutionStep } from "./agent-stream-lifi.js";
import type {
  LiquidityFallbackOfferedStreamInput,
  SquidQuoteStreamInput,
} from "./agent-stream.types.js";

export const LIQUIDITY_FALLBACK_OFFERED_LABEL = "Finding another route…";
export const SQUID_QUOTE_RUNNING_LABEL = "Getting alternate route…";

function fallbackOfferDetail(input: LiquidityFallbackOfferedStreamInput): string | undefined {
  const pair = `${input.from_token} → ${input.to_token}`;
  if (input.from_chain_id && input.to_chain_id) {
    return `${pair} (${input.from_chain_id} → ${input.to_chain_id})`;
  }
  return pair;
}

export function buildLiquidityFallbackOfferedStep(
  input: LiquidityFallbackOfferedStreamInput,
  status: ExecutionStepStatus = "running",
): ExecutionProgressStep {
  return {
    id: "liquidity_fallback_offered",
    status,
    label: LIQUIDITY_FALLBACK_OFFERED_LABEL,
    detail: fallbackOfferDetail(input),
    status_category: "defi",
  };
}

export function buildSquidQuoteStep(input: SquidQuoteStreamInput): ExecutionProgressStep {
  const label =
    input.status === "running"
      ? SQUID_QUOTE_RUNNING_LABEL
      : input.status === "ok"
        ? "Alternate route ready"
        : "Alternate route unavailable";

  const detail =
    input.detail ??
    (input.from_token && input.to_token ? `${input.from_token} → ${input.to_token}` : undefined);

  return {
    id: "squid_quote",
    status: input.status,
    label,
    ...(detail ? { detail } : {}),
    status_category: "defi",
  };
}

/** Push liquidity-fallback consent step to live chat SSE subscribers. */
export function emitLiquidityFallbackOfferedStep(
  sessionId: string | null | undefined,
  input: LiquidityFallbackOfferedStreamInput,
): void {
  emitAgentStreamExecutionStep(sessionId, buildLiquidityFallbackOfferedStep(input));
}

/** Push Squid quote progress to live chat SSE subscribers. */
export function emitSquidQuoteStep(
  sessionId: string | null | undefined,
  input: SquidQuoteStreamInput,
): void {
  emitAgentStreamExecutionStep(sessionId, buildSquidQuoteStep(input));
}
