import type { ChainQueryHandler } from "../types.js";
import {
  getStellarSoroswapQueryHandler,
  STELLAR_SOROSWAP_EXECUTE_ACTIONS,
  STELLAR_SOROSWAP_EXECUTE_SCHEMA,
  STELLAR_SOROSWAP_QUERY_SCHEMA,
  STELLAR_SOROSWAP_QUERY_TYPES,
} from "./soroswap/index.js";

export const STELLAR_TRANSFER_ACTIONS = [
  "transfer_native",
  "transfer_xlm",
  "submit_xdr",
] as const;

export const STELLAR_EXECUTE_SCHEMA = {
  actionDescription:
    "transfer_native, transfer_xlm, submit_xdr (unsigned XDR from a quote provider), stellar_swap (Phase 1).",
  paramsDescription:
    "Stellar transfer_native / transfer_xlm: { recipient, amount_stroops } or { recipient, amount_xlm }. " +
    "Stellar submit_xdr: { transaction_xdr, simulate?: false }. " +
    STELLAR_SOROSWAP_EXECUTE_SCHEMA.paramsDescription,
};

export function getStellarQueryHandler(query: string): ChainQueryHandler | null {
  return getStellarSoroswapQueryHandler(query);
}

export {
  STELLAR_SOROSWAP_QUERY_TYPES,
  STELLAR_SOROSWAP_QUERY_SCHEMA,
  STELLAR_SOROSWAP_EXECUTE_ACTIONS,
};
