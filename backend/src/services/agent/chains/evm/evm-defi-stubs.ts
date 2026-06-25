import { AppError } from "../../../../errors/app-error.js";
import type { ChainQueryHandler } from "../types.js";

/** Phase 1 — SushiSwap query stubs (schema only until HTTP clients ship). */
export const EVM_DEFI_QUERY_TYPES = ["evm_swap_quote"] as const;

export const EVM_DEFI_QUERY_SCHEMA = {
  description: "evm_swap_quote (SushiSwap, Phase 3).",
  paramsDescription:
    "evm_swap_quote: { evm_chain_id, token_in, token_out, amount } — same-chain EVM swap quote (Phase 3).",
};

export const EVM_EXECUTE_ACTIONS = ["transfer_native", "transfer_eth", "evm_swap"] as const;

export const EVM_EXECUTE_SCHEMA = {
  actionDescription: "transfer_native, transfer_eth, evm_swap (SushiSwap — Phase 3).",
  paramsDescription:
    "transfer_native / transfer_eth: { recipient, amount_atomic } or { recipient, amount_wei }. " +
    "evm_swap: { evm_chain_id, ... } — Phase 3; requires evm_swap_quote first.",
};
