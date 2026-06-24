import { AppError } from "../../../../errors/app-error.js";
import type { ChainQueryHandler, QueryHandlerContext } from "../types.js";

/** Phase 1 — Li-Fi / SushiSwap query stubs (schema only until HTTP clients ship). */
export const EVM_DEFI_QUERY_TYPES = [
  "evm_swap_quote",
  "cross_chain_quote",
  "cross_chain_status",
] as const;

export const EVM_DEFI_QUERY_SCHEMA = {
  description: "evm_swap_quote (SushiSwap, Phase 1), cross_chain_quote, cross_chain_status (Li-Fi, Phase 1).",
  paramsDescription:
    "evm_swap_quote: { evm_chain_id, token_in, token_out, amount } — same-chain EVM swap quote (Phase 1). " +
    "cross_chain_quote: { from_evm_chain_id, to_evm_chain_id, token, amount } — Li-Fi bridge quote (Phase 1). " +
    "cross_chain_status: { bridge_id } — poll Li-Fi transfer status (Phase 1).",
};

const NOT_IMPLEMENTED: ChainQueryHandler = async (ctx) => {
  throw new AppError(
    501,
    "NOT_IMPLEMENTED",
    `Query "${ctx.query}" is not implemented yet (Phase 1 DeFi providers).`,
  );
};

const EVM_QUERY_HANDLERS: Record<string, ChainQueryHandler> = Object.fromEntries(
  EVM_DEFI_QUERY_TYPES.map((query) => [query, NOT_IMPLEMENTED]),
);

export function getEvmDefiQueryHandler(query: string): ChainQueryHandler | null {
  return EVM_QUERY_HANDLERS[query] ?? null;
}

export const EVM_EXECUTE_ACTIONS = ["transfer_native", "transfer_eth", "evm_swap"] as const;

export const EVM_EXECUTE_SCHEMA = {
  actionDescription: "transfer_native, transfer_eth, evm_swap (SushiSwap — Phase 1).",
  paramsDescription:
    "transfer_native / transfer_eth: { recipient, amount_atomic } or { recipient, amount_wei }. " +
    "evm_swap: { evm_chain_id, ... } — Phase 1; requires evm_swap_quote first.",
};
