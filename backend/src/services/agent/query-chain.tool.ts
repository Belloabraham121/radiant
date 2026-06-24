export {
  QUERY_CHAIN_TOOL_NAME,
  runQueryChainTool,
} from "./tools/query-chain.tool.js";

import {
  buildQueryChainToolDefinition,
  staticToolDefinitionsContext,
} from "./tools/build-tool-definitions.js";

export const queryChainToolDefinition = buildQueryChainToolDefinition(
  staticToolDefinitionsContext(),
);
