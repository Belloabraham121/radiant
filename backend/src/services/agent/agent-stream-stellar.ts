import type { ExecutionProgressStep, ExecutionStepStatus } from "./execution-progress.types.js";
import { emitAgentStreamExecutionStep } from "./agent-stream-lifi.js";
import type {
  SoroswapExecutionStreamMeta,
  SoroswapQuoteStreamInput,
  SoroswapTrackingStreamInput,
  StellarRoutingFallbackOfferedStreamInput,
} from "./agent-stream.types.js";

export const STELLAR_ROUTING_FALLBACK_OFFERED_LABEL = "Checking Stellar option…";
export const SOROSWAP_QUOTE_RUNNING_LABEL = "Getting Stellar quote…";
export const STELLAR_BUILD_RUNNING_LABEL = "Building transaction…";
export const STELLAR_SIGN_LABEL = "Awaiting signature…";
export const STELLAR_SUBMIT_LABEL = "Submitted";
export const STELLAR_CONFIRM_RUNNING_LABEL = "Confirming…";

const STELLAR_CHAIN_ID = "stellar" as const;

function tokenPairDetail(tokenIn?: string, tokenOut?: string): string | undefined {
  if (tokenIn && tokenOut) {
    return `${tokenIn} → ${tokenOut}`;
  }
  return undefined;
}

function stellarMeta(meta: SoroswapExecutionStreamMeta): Partial<ExecutionProgressStep> {
  return {
    chain_id: STELLAR_CHAIN_ID,
    status_category: "defi",
    ...(meta.transaction_id ? { agent_transaction_id: meta.transaction_id } : {}),
    ...(meta.digest ? { digest: meta.digest } : {}),
  };
}

function routingFallbackDetail(input: StellarRoutingFallbackOfferedStreamInput): string | undefined {
  const pair = tokenPairDetail(input.token_in, input.token_out);
  if (input.selected_chain_id && pair) {
    return `${pair} (selected: ${input.selected_chain_id})`;
  }
  return pair;
}

export function buildStellarRoutingFallbackOfferedStep(
  input: StellarRoutingFallbackOfferedStreamInput,
  status: ExecutionStepStatus = "running",
): ExecutionProgressStep {
  return {
    id: "stellar_routing_fallback_offered",
    status,
    label: STELLAR_ROUTING_FALLBACK_OFFERED_LABEL,
    detail: routingFallbackDetail(input),
    status_category: "defi",
  };
}

export function buildSoroswapQuoteStep(input: SoroswapQuoteStreamInput): ExecutionProgressStep {
  const label =
    input.status === "running"
      ? SOROSWAP_QUOTE_RUNNING_LABEL
      : input.status === "ok"
        ? "Stellar quote ready"
        : "Stellar quote unavailable";

  const detail =
    input.detail ?? tokenPairDetail(input.token_in, input.token_out);

  return {
    id: "soroswap_quote",
    status: input.status,
    label,
    ...(detail ? { detail } : {}),
    status_category: "defi",
    chain_id: STELLAR_CHAIN_ID,
  };
}

export function buildStellarBuildStep(
  status: ExecutionStepStatus,
  meta: SoroswapExecutionStreamMeta = {},
): ExecutionProgressStep {
  return {
    id: "stellar_build",
    status,
    label: status === "running" ? STELLAR_BUILD_RUNNING_LABEL : "Transaction built",
    ...stellarMeta(meta),
  };
}

export function buildStellarSignStep(
  status: ExecutionStepStatus,
  meta: SoroswapExecutionStreamMeta = {},
): ExecutionProgressStep {
  return {
    id: "stellar_sign",
    status,
    label: STELLAR_SIGN_LABEL,
    detail:
      status === "warning"
        ? "Waiting for your approval in the dialog"
        : status === "failed"
          ? "Signature failed"
          : undefined,
    ...stellarMeta(meta),
  };
}

export function buildStellarSubmitStep(
  status: ExecutionStepStatus,
  meta: SoroswapExecutionStreamMeta = {},
): ExecutionProgressStep {
  const detail =
    meta.digest && status === "ok"
      ? `Tx · ${meta.digest.slice(0, 10)}…`
      : status === "failed"
        ? "Broadcast failed"
        : undefined;

  return {
    id: "stellar_submit",
    status,
    label: STELLAR_SUBMIT_LABEL,
    ...(detail ? { detail } : {}),
    ...stellarMeta(meta),
  };
}

export function buildStellarConfirmStep(
  status: ExecutionStepStatus,
  meta: SoroswapExecutionStreamMeta = {},
): ExecutionProgressStep {
  const label =
    status === "running"
      ? STELLAR_CONFIRM_RUNNING_LABEL
      : status === "ok"
        ? "Complete"
        : "Failed";

  return {
    id: "stellar_confirm",
    status,
    label,
    detail:
      status === "failed"
        ? "Stellar swap did not confirm on-chain"
        : meta.digest && status === "ok"
          ? `Confirmed · ${meta.digest.slice(0, 10)}…`
          : undefined,
    ...stellarMeta(meta),
  };
}

export function soroswapExecutionSteps(input: SoroswapTrackingStreamInput): ExecutionProgressStep[] {
  const meta: SoroswapExecutionStreamMeta = {
    transaction_id: input.transaction_id,
    digest: input.digest,
    token_in: input.token_in,
    token_out: input.token_out,
    quote_id: input.quote_id,
  };

  const steps: ExecutionProgressStep[] = [
    buildSoroswapQuoteStep({
      status: "ok",
      token_in: input.token_in,
      token_out: input.token_out,
    }),
    buildStellarBuildStep("ok", meta),
    buildStellarSignStep("ok", meta),
    buildStellarSubmitStep(input.digest ? "ok" : "running", meta),
  ];

  if (input.tracking_status === "success") {
    steps.push(buildStellarConfirmStep("ok", meta));
    return steps;
  }

  if (input.tracking_status === "failed") {
    steps.push(buildStellarConfirmStep("failed", meta));
    return steps;
  }

  steps.push(buildStellarConfirmStep("running", meta));
  return steps;
}

export function buildInitialSoroswapExecutionSteps(
  input: SoroswapTrackingStreamInput,
): ExecutionProgressStep[] {
  return soroswapExecutionSteps(input);
}

export function emitStellarRoutingFallbackOfferedStep(
  sessionId: string | null | undefined,
  input: StellarRoutingFallbackOfferedStreamInput,
): void {
  emitAgentStreamExecutionStep(sessionId, buildStellarRoutingFallbackOfferedStep(input));
}

export function emitSoroswapQuoteStep(
  sessionId: string | null | undefined,
  input: SoroswapQuoteStreamInput,
): void {
  emitAgentStreamExecutionStep(sessionId, buildSoroswapQuoteStep(input));
}

export function emitStellarSignAwaitingStep(
  sessionId: string | null | undefined,
  meta: SoroswapExecutionStreamMeta = {},
): void {
  emitAgentStreamExecutionStep(sessionId, buildStellarSignStep("warning", meta));
}

export function emitSoroswapExecutionSteps(
  sessionId: string | null | undefined,
  steps: ExecutionProgressStep[],
): void {
  if (!sessionId) {
    return;
  }
  for (const step of steps) {
    emitAgentStreamExecutionStep(sessionId, step);
  }
}
