import { AppError } from "../../../../errors/app-error.js";
import type { ChainQueryHandler } from "../types.js";
import {
  EVM_EXECUTE_ACTIONS,
  EVM_EXECUTE_SCHEMA,
  EVM_DEFI_QUERY_TYPES,
  EVM_DEFI_QUERY_SCHEMA,
} from "./evm-defi-stubs.js";
import {
  getLifiQueryHandler,
  LIFI_QUERY_HANDLERS,
  LIFI_QUERY_SCHEMA,
  LIFI_QUERY_TYPES,
} from "./lifi/query-handlers.js";
import {
  LIFI_EXECUTE_ACTIONS,
  LIFI_EXECUTE_SCHEMA,
} from "./lifi/execute-actions.js";
import { lifiPreflightHooks } from "./lifi/approval-preflight.js";

export const EVM_DEFI_QUERY_TYPES_ALL = [
  ...EVM_DEFI_QUERY_TYPES,
  ...LIFI_QUERY_TYPES,
] as const;

export const EVM_DEFI_QUERY_SCHEMA_MERGED = {
  description: `${EVM_DEFI_QUERY_SCHEMA.description} ${LIFI_QUERY_SCHEMA.description}`,
  paramsDescription: `${EVM_DEFI_QUERY_SCHEMA.paramsDescription} ${LIFI_QUERY_SCHEMA.paramsDescription}`,
};

const NOT_IMPLEMENTED: ChainQueryHandler = async (ctx) => {
  throw new AppError(
    501,
    "NOT_IMPLEMENTED",
    `Query "${ctx.query}" is not implemented yet (Phase 1 DeFi providers).`,
  );
};

const EVM_QUERY_HANDLERS: Record<string, ChainQueryHandler> = {
  ...Object.fromEntries(EVM_DEFI_QUERY_TYPES.map((query) => [query, NOT_IMPLEMENTED])),
  ...LIFI_QUERY_HANDLERS,
};

export function getEvmDefiQueryHandler(query: string): ChainQueryHandler | null {
  return EVM_QUERY_HANDLERS[query] ?? getLifiQueryHandler(query);
}

export const EVM_EXECUTE_ACTIONS_ALL = [
  ...EVM_EXECUTE_ACTIONS,
  ...LIFI_EXECUTE_ACTIONS,
] as const;

export const EVM_EXECUTE_SCHEMA_MERGED = {
  actionDescription: `${EVM_EXECUTE_SCHEMA.actionDescription} ${LIFI_EXECUTE_SCHEMA.actionDescription}`,
  paramsDescription: `${EVM_EXECUTE_SCHEMA.paramsDescription} ${LIFI_EXECUTE_SCHEMA.paramsDescription}`,
};

export { lifiPreflightHooks };
