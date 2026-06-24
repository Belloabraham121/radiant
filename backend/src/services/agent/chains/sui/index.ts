import type { ChainPlugin } from "../types.js";
import {
  DEEPBOOK_EXECUTE_ACTIONS,
  DEEPBOOK_EXECUTE_SCHEMA,
  DEEPBOOK_FLASH_LOAN_QUERIES,
  DEEPBOOK_GOVERNANCE_QUERIES,
  DEEPBOOK_MARGIN_QUERIES,
  DEEPBOOK_PREDICT_QUERIES,
} from "./deepbook/execute-actions.js";
import {
  DEEPBOOK_QUERY_SCHEMA,
  DEEPBOOK_QUERY_TYPES,
  runDeepBookQuery,
} from "./deepbook/query-handlers.js";
import {
  LIFI_QUERY_HANDLERS,
  LIFI_QUERY_SCHEMA,
  LIFI_QUERY_TYPES,
} from "../evm/lifi/query-handlers.js";
import {
  LIFI_EXECUTE_ACTIONS,
  LIFI_EXECUTE_SCHEMA,
} from "../evm/lifi/execute-actions.js";
import { lifiPreflightHooks } from "../evm/lifi/approval-preflight.js";
import { deepBookPreflightHooks } from "./deepbook/approval-preflight.js";

export function getSuiChainPlugin(): ChainPlugin {
  return {
    folderKey: "sui",
    chainIds: ["sui"],
    queries: [
      {
        chainIds: ["sui"],
        queryTypes: [...DEEPBOOK_QUERY_TYPES, ...LIFI_QUERY_TYPES],
        handler: async (ctx) => {
          const lifiHandler = LIFI_QUERY_HANDLERS[ctx.query];
          if (lifiHandler) {
            return lifiHandler(ctx);
          }
          return runDeepBookQuery(ctx);
        },
        schema: {
          queryTypes: [...DEEPBOOK_QUERY_TYPES, ...LIFI_QUERY_TYPES],
          description: `${DEEPBOOK_QUERY_SCHEMA.description} ${LIFI_QUERY_SCHEMA.description}`,
          paramsDescription: `${DEEPBOOK_QUERY_SCHEMA.paramsDescription} ${LIFI_QUERY_SCHEMA.paramsDescription}`,
        },
      },
    ],
    execute: {
      chainIds: ["sui"],
      actions: [
        ...DEEPBOOK_EXECUTE_ACTIONS,
        "transfer_native",
        "transfer_sui",
        "execute_bytes",
        ...LIFI_EXECUTE_ACTIONS,
      ],
      actionDescription:
        "Sui: transfer_native, transfer_sui, execute_bytes. " +
        DEEPBOOK_EXECUTE_SCHEMA.actionDescription +
        " " +
        LIFI_EXECUTE_SCHEMA.actionDescription,
      paramsDescription: `${DEEPBOOK_EXECUTE_SCHEMA.paramsDescription} ${LIFI_EXECUTE_SCHEMA.paramsDescription}`,
      preflightHooks: [...deepBookPreflightHooks, ...lifiPreflightHooks],
    },
  };
}

export {
  DEEPBOOK_FLASH_LOAN_QUERIES,
  DEEPBOOK_GOVERNANCE_QUERIES,
  DEEPBOOK_MARGIN_QUERIES,
  DEEPBOOK_PREDICT_QUERIES,
};
