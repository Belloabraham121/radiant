import { createHash, randomUUID } from "node:crypto";
import type { LiFiStep, Route, StatusResponse } from "@lifi/types";
import type { RouteQuote, RouteStep } from "../types.js";
import { lifiChainIdToEvmChainId } from "./lifi-chain-map.js";
import type {
  CrossChainQuote,
  CrossChainRouteOption,
  CrossChainStatusResult,
  LifiTransactionRequest,
} from "./lifi.types.js";

function sumUsd(costs: Array<{ amountUSD?: string }> | undefined): number | null {
  if (!costs || costs.length === 0) {
    return null;
  }
  let total = 0;
  let hasValue = false;
  for (const cost of costs) {
    const parsed = Number.parseFloat(cost.amountUSD ?? "");
    if (Number.isFinite(parsed)) {
      total += parsed;
      hasValue = true;
    }
  }
  return hasValue ? total : null;
}

function extractBridges(route: Route | LiFiStep): string[] {
  const steps = "steps" in route ? route.steps : [route];
  const bridges = new Set<string>();
  for (const step of steps) {
    if (step.tool) {
      bridges.add(step.tool);
    }
    for (const included of step.includedSteps ?? []) {
      if (included.tool) {
        bridges.add(included.tool);
      }
    }
  }
  return [...bridges];
}

function normalizeRouteSteps(route: Route | LiFiStep): RouteStep[] {
  const steps = "steps" in route ? route.steps : [route];
  const normalized: RouteStep[] = [];

  for (const step of steps) {
    const fromChain = lifiChainIdToEvmChainId(step.action.fromChainId);
    const toChain = lifiChainIdToEvmChainId(step.action.toChainId);
    const type: RouteStep["type"] =
      step.type === "lifi" ? "bridge" : step.type === "swap" ? "swap" : "bridge";

    normalized.push({
      type,
      provider: "evm-lifi",
      from_chain: String(fromChain),
      to_chain: String(toChain),
      from_token: step.action.fromToken.symbol,
      to_token: step.action.toToken.symbol,
      tool: step.tool,
    });
  }

  return normalized;
}

function toTransactionRequest(step: LiFiStep): LifiTransactionRequest | null {
  const tx = step.transactionRequest;
  if (!tx?.to || !tx.from || !tx.chainId) {
    return null;
  }

  return {
    chain_id: tx.chainId,
    to: tx.to,
    from: tx.from,
    data: tx.data ?? "0x",
    value: tx.value ?? "0",
    gas_limit: tx.gasLimit,
  };
}

function quoteExpiresAt(route: Route | LiFiStep): string | null {
  const steps = "steps" in route ? route.steps : [route];
  const timestamps = steps
    .map((step) => step.estimate?.executionDuration)
    .filter((value): value is number => typeof value === "number");
  if (timestamps.length === 0) {
    return null;
  }
  const maxSeconds = Math.max(...timestamps);
  return new Date(Date.now() + maxSeconds * 1000).toISOString();
}

export function createRouteId(seed?: string): string {
  if (seed) {
    return createHash("sha256").update(seed).digest("hex").slice(0, 16);
  }
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

export function normalizeLifiStepToCrossChainQuote(input: {
  step: LiFiStep;
  fromEvmChainId: number;
  toEvmChainId: number;
  fromTokenSymbol: string;
  toTokenSymbol: string;
  routeId?: string;
}): CrossChainQuote {
  const route = normalizeLifiStepToRouteQuote(input);
  const routeId = input.routeId ?? createRouteId(JSON.stringify(input.step));

  return {
    ...route,
    route_id: routeId,
    from_evm_chain_id: input.fromEvmChainId,
    to_evm_chain_id: input.toEvmChainId,
    from_token_symbol: input.fromTokenSymbol,
    to_token_symbol: input.toTokenSymbol,
    gas_cost_usd: sumUsd(input.step.estimate?.gasCosts),
    fee_cost_usd: sumUsd(input.step.estimate?.feeCosts),
    tool: input.step.tool ?? null,
    transaction_request: toTransactionRequest(input.step),
    lifi_route: null,
  };
}

export function normalizeLifiRouteToCrossChainQuote(input: {
  route: Route;
  fromEvmChainId: number;
  toEvmChainId: number;
  fromTokenSymbol: string;
  toTokenSymbol: string;
  routeId?: string;
}): CrossChainQuote {
  const base = normalizeLifiRouteToRouteQuote(input);
  const routeId = input.routeId ?? input.route.id ?? createRouteId(JSON.stringify(input.route));

  return {
    ...base,
    route_id: routeId,
    from_evm_chain_id: input.fromEvmChainId,
    to_evm_chain_id: input.toEvmChainId,
    from_token_symbol: input.fromTokenSymbol,
    to_token_symbol: input.toTokenSymbol,
    gas_cost_usd: sumUsd(input.route.steps[0]?.estimate?.gasCosts),
    fee_cost_usd: sumUsd(input.route.steps[0]?.estimate?.feeCosts),
    tool: input.route.steps[0]?.tool ?? null,
    transaction_request: input.route.steps[0]
      ? toTransactionRequest(input.route.steps[0])
      : null,
    lifi_route: input.route,
  };
}

export function normalizeLifiStepToRouteQuote(input: {
  step: LiFiStep;
  fromEvmChainId: number;
  toEvmChainId: number;
  fromTokenSymbol: string;
  toTokenSymbol: string;
}): RouteQuote {
  return {
    provider_id: "evm-lifi",
    from_chain_id: "ethereum",
    to_chain_id: "ethereum",
    from_token: input.fromTokenSymbol,
    to_token: input.toTokenSymbol,
    from_amount_atomic: input.step.estimate.fromAmount,
    to_amount_atomic: input.step.estimate.toAmount,
    steps: normalizeRouteSteps(input.step),
    bridges: extractBridges(input.step),
    estimated_duration_seconds: input.step.estimate.executionDuration ?? null,
    expires_at: quoteExpiresAt(input.step),
  };
}

export function normalizeLifiRouteToRouteQuote(input: {
  route: Route;
  fromEvmChainId: number;
  toEvmChainId: number;
  fromTokenSymbol: string;
  toTokenSymbol: string;
}): RouteQuote {
  const first = input.route.steps[0];
  return {
    provider_id: "evm-lifi",
    from_chain_id: "ethereum",
    to_chain_id: "ethereum",
    from_token: input.fromTokenSymbol,
    to_token: input.toTokenSymbol,
    from_amount_atomic: first?.estimate.fromAmount ?? input.route.fromAmount,
    to_amount_atomic: first?.estimate.toAmount ?? input.route.toAmount,
    steps: normalizeRouteSteps(input.route),
    bridges: extractBridges(input.route),
    estimated_duration_seconds: input.route.steps.reduce(
      (max, step) => Math.max(max, step.estimate.executionDuration ?? 0),
      0,
    ) || null,
    expires_at: quoteExpiresAt(input.route),
  };
}

export function normalizeLifiRouteOption(input: {
  route: Route;
  fromEvmChainId: number;
  toEvmChainId: number;
  fromTokenSymbol: string;
  toTokenSymbol: string;
}): CrossChainRouteOption {
  const routeId = input.route.id ?? createRouteId(JSON.stringify(input.route));
  const exchanges = new Set<string>();
  for (const step of input.route.steps) {
    for (const included of step.includedSteps ?? []) {
      if (included.tool) {
        exchanges.add(included.tool);
      }
    }
  }

  return {
    route_id: routeId,
    provider_id: "evm-lifi",
    from_evm_chain_id: input.fromEvmChainId,
    to_evm_chain_id: input.toEvmChainId,
    from_token_symbol: input.fromTokenSymbol,
    to_token_symbol: input.toTokenSymbol,
    from_amount_atomic: input.route.fromAmount,
    to_amount_atomic: input.route.toAmount,
    bridges: extractBridges(input.route),
    exchanges: [...exchanges],
    estimated_duration_seconds:
      input.route.steps.reduce((max, step) => Math.max(max, step.estimate.executionDuration ?? 0), 0) ||
      null,
    gas_cost_usd: sumUsd(input.route.steps[0]?.estimate?.gasCosts),
    fee_cost_usd: sumUsd(input.route.steps[0]?.estimate?.feeCosts),
    tags: input.route.tags ?? [],
    lifi_route: input.route,
  };
}

export function normalizeLifiStatus(input: {
  status: StatusResponse;
  txHash: string;
  fromEvmChainId: number;
  toEvmChainId: number;
}): CrossChainStatusResult {
  const receivingTxHash =
    "receiving" in input.status &&
    input.status.receiving &&
    "txHash" in input.status.receiving
      ? input.status.receiving.txHash
      : null;

  return {
    status: input.status.status,
    substatus: input.status.substatus ?? null,
    substatus_message: input.status.substatusMessage ?? null,
    tx_hash: input.txHash,
    from_evm_chain_id: input.fromEvmChainId,
    to_evm_chain_id: input.toEvmChainId,
    receiving_tx_hash: receivingTxHash,
    tool: "tool" in input.status ? input.status.tool : null,
    raw: input.status,
  };
}
