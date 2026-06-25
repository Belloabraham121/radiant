import { AppError } from "../../../../errors/app-error.js";
import type { ChainQueryHandler, QueryHandlerContext } from "../types.js";
import {
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

const NOT_IMPLEMENTED: ChainQueryHandler = async (ctx) => {
  throw new AppError(
    501,
    "NOT_IMPLEMENTED",
    `Query "${ctx.query}" is not implemented yet (Phase 1 Soroswap).`,
  );
};

const STELLAR_QUERY_HANDLERS: Record<string, ChainQueryHandler> = Object.fromEntries(
  STELLAR_SOROSWAP_QUERY_TYPES.map((query) => [query, NOT_IMPLEMENTED]),
);

export function getStellarQueryHandler(query: string): ChainQueryHandler | null {
  return STELLAR_QUERY_HANDLERS[query] ?? null;
}

export {
  STELLAR_SOROSWAP_QUERY_TYPES,
  STELLAR_SOROSWAP_QUERY_SCHEMA,
  STELLAR_SOROSWAP_EXECUTE_ACTIONS,
};
