import { createLogger } from "../../../shared/logger.js";
import type { ChainId } from "../../chains/types.js";

const log = createLogger("soroswap-observability");

/** Structured log span for aggregating Stellar/Soroswap quote volume. */
export function logStellarSwapQuoteTotal(input: {
  outcome: "success" | "error";
  quote_id?: string;
  token_in?: string;
  token_out?: string;
  error_code?: string;
  duration_ms?: number;
  source?: "direct" | "routing_fallback";
}): void {
  log.info("stellar_swap_quote_total", {
    outcome: input.outcome,
    quote_id: input.quote_id,
    token_in: input.token_in,
    token_out: input.token_out,
    error_code: input.error_code,
    duration_ms: input.duration_ms,
    source: input.source ?? "direct",
  });
}

/** Structured log span when user accepts a Stellar routing fallback offer. */
export function logStellarRoutingFallbackAcceptedTotal(input: {
  fallback_offer_id: string;
  selected_chain_id: ChainId;
  selected_evm_chain_id?: number;
  token_in: string;
  token_out: string;
  primary_error_code?: string;
}): void {
  log.info("stellar_routing_fallback_accepted_total", {
    fallback_offer_id: input.fallback_offer_id,
    selected_chain_id: input.selected_chain_id,
    selected_evm_chain_id: input.selected_evm_chain_id,
    token_in: input.token_in,
    token_out: input.token_out,
    primary_error_code: input.primary_error_code,
  });
}
