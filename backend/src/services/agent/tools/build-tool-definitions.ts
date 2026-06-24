import { getEnabledChainConfigs } from "../../../config/chains.js";
import { CHAIN_IDS, type ChainId } from "../../chains/types.js";
import type { BuildToolDefinitionsContext } from "../chains/types.js";
import { defaultAgentPermissions } from "../agent-permissions.service.js";
import type { AgentToolDefinition } from "../runtime/openai-tools.js";
import { CORE_EXECUTE_SCHEMA } from "../chains/core/execute-actions.js";
import { CORE_QUERY_SCHEMA } from "../chains/core/query-schema.js";
import {
  getChainPluginsForEnabledChains,
  resolveExecuteActionDescription,
  resolveQueryTypes,
} from "../chains/registry.js";

export const QUERY_CHAIN_TOOL_NAME = "query_chain" as const;
export const EXECUTE_TRANSACTION_TOOL_NAME = "execute_transaction" as const;

function buildQueryDescription(context: BuildToolDefinitionsContext): string {
  const plugins = getChainPluginsForEnabledChains(context.enabledChains);
  const queryTypes = resolveQueryTypes(context);
  const pluginDescriptions = plugins
    .flatMap((plugin) => plugin.queries.map((q) => q.schema.description))
    .filter(Boolean);
  return (
    "Read-only query type: " +
    CORE_QUERY_SCHEMA.description +
    (pluginDescriptions.length > 0 ? " " + pluginDescriptions.join(" ") : "") +
    ` (${queryTypes.length} types enabled).`
  );
}

function buildParamsDescription(context: BuildToolDefinitionsContext): string {
  const plugins = getChainPluginsForEnabledChains(context.enabledChains);
  const pluginParams = plugins
    .flatMap((plugin) => plugin.queries.map((q) => q.schema.paramsDescription))
    .filter((value): value is string => Boolean(value));
  return [CORE_QUERY_SCHEMA.paramsDescription, ...pluginParams].join(" ");
}

export function buildQueryChainToolDefinition(
  context: BuildToolDefinitionsContext,
): AgentToolDefinition {
  const queryTypes = resolveQueryTypes(context);
  const enabledChains =
    context.enabledChains.length > 0 ? [...context.enabledChains] : [...CHAIN_IDS];

  return {
    name: QUERY_CHAIN_TOOL_NAME,
    description:
      "Read-only chain queries for the authenticated user's agent wallet. " +
      "Wallet address is resolved from session — never pass wallet addresses.",
    input_schema: {
      type: "object" as const,
      properties: {
        chain_id: {
          type: "string",
          enum: enabledChains,
          description: "Target chain (must be enabled for this app).",
        },
        query: {
          type: "string",
          enum: queryTypes,
          description: buildQueryDescription(context),
        },
        params: {
          type: "object",
          description: "Query params. " + buildParamsDescription(context),
          additionalProperties: true,
        },
      },
      required: ["chain_id", "query"] as const,
      additionalProperties: false,
    },
  };
}

export function buildExecuteTransactionToolDefinition(
  context: BuildToolDefinitionsContext,
): AgentToolDefinition {
  const enabledChains =
    context.enabledChains.length > 0 ? [...context.enabledChains] : [...CHAIN_IDS];
  const { actionDescription, paramsDescription } = resolveExecuteActionDescription(context);

  return {
    name: EXECUTE_TRANSACTION_TOOL_NAME,
    description:
      "Sign and broadcast a transaction on the user's agent wallet for the given chain. " +
      "The wallet is resolved from the authenticated session — never pass wallet addresses.",
    input_schema: {
      type: "object" as const,
      properties: {
        chain_id: {
          type: "string",
          enum: enabledChains,
          description: "Target chain (must be enabled for this app).",
        },
        action: {
          type: "string",
          description:
            "Chain-specific action name. " +
            CORE_EXECUTE_SCHEMA.actionDescription +
            " " +
            actionDescription,
        },
        params: {
          type: "object",
          description:
            "Action parameters. " +
            CORE_EXECUTE_SCHEMA.paramsDescription +
            " " +
            paramsDescription,
          additionalProperties: true,
        },
      },
      required: ["chain_id", "action", "params"] as const,
      additionalProperties: false,
    },
  };
}

/** Static fallback context — all chains, all permission-gated features visible (tests). */
export function staticToolDefinitionsContext(): BuildToolDefinitionsContext {
  return {
    enabledChains: [...CHAIN_IDS],
    permissions: {
      ...defaultAgentPermissions(),
      allow_flash_loans: true,
      allow_governance: true,
      allow_margin: true,
      allow_predict: true,
    },
  };
}

export function buildAgentChainToolDefinitions(
  context: BuildToolDefinitionsContext,
): AgentToolDefinition[] {
  return [
    buildExecuteTransactionToolDefinition(context),
    buildQueryChainToolDefinition(context),
  ];
}

export function enabledChainsFromEnv(): ChainId[] {
  return getEnabledChainConfigs().map((config) => config.id);
}
