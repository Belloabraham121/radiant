export {
  EXECUTE_TRANSACTION_TOOL_NAME,
  runExecuteTransactionTool,
} from "./tools/execute-transaction.tool.js";

import {
  buildExecuteTransactionToolDefinition,
  staticToolDefinitionsContext,
} from "./tools/build-tool-definitions.js";

export const executeTransactionToolDefinition = buildExecuteTransactionToolDefinition(
  staticToolDefinitionsContext(),
);
