import type { ChainId } from "../../chains/types.js";
import type { AgentPermissions } from "../agent-permissions.types.js";
import { denyDefaultAgentPermissions } from "../agent-permissions.service.js";
import {
  chainIdToFolderKey,
  type BuildToolDefinitionsContext,
  type ChainFolderKey,
  type ChainPlugin,
  type ChainQueryHandler,
  type ExecutePreflightRegistration,
} from "./types.js";
import { getCoreQueryHandler } from "./core/queries.js";
import { CORE_QUERY_TYPES } from "./core/query-schema.js";
import { getSuiChainPlugin } from "./sui/index.js";
import {
  EVM_DEFI_QUERY_TYPES_ALL,
  EVM_DEFI_QUERY_SCHEMA_MERGED,
  EVM_EXECUTE_ACTIONS_ALL,
  EVM_EXECUTE_SCHEMA_MERGED,
  getEvmDefiQueryHandler,
  lifiPreflightHooks,
} from "./evm/index.js";
import {
  LIFI_QUERY_HANDLERS,
  LIFI_QUERY_SCHEMA,
  LIFI_QUERY_TYPES,
} from "./evm/lifi/query-handlers.js";
import {
  LIFI_EXECUTE_ACTIONS,
  LIFI_EXECUTE_SCHEMA,
} from "./evm/lifi/execute-actions.js";
import {
  getStellarQueryHandler,
  STELLAR_EXECUTE_SCHEMA,
  STELLAR_SOROSWAP_EXECUTE_ACTIONS,
  STELLAR_SOROSWAP_QUERY_TYPES,
  STELLAR_SOROSWAP_QUERY_SCHEMA,
  STELLAR_TRANSFER_ACTIONS,
} from "./stellar/index.js";
import {
  DEEPBOOK_FLASH_LOAN_QUERIES,
  DEEPBOOK_GOVERNANCE_QUERIES,
  DEEPBOOK_MARGIN_QUERIES,
  DEEPBOOK_PREDICT_QUERIES,
} from "./sui/deepbook/execute-actions.js";
import type { ExecuteTransactionInput } from "../../chains/types.js";

export { chainIdToFolderKey } from "./types.js";

function getEvmChainPlugin(): ChainPlugin {
  return {
    folderKey: "evm",
    chainIds: ["ethereum"],
    queries: [
      {
        chainIds: ["ethereum"],
        queryTypes: EVM_DEFI_QUERY_TYPES_ALL,
        handler: async (ctx) => {
          const handler = getEvmDefiQueryHandler(ctx.query);
          if (!handler) {
            throw new Error(`Missing EVM query handler: ${ctx.query}`);
          }
          return handler(ctx);
        },
        schema: {
          queryTypes: EVM_DEFI_QUERY_TYPES_ALL,
          description: EVM_DEFI_QUERY_SCHEMA_MERGED.description,
          paramsDescription: EVM_DEFI_QUERY_SCHEMA_MERGED.paramsDescription,
        },
      },
    ],
    execute: {
      chainIds: ["ethereum"],
      actions: [...EVM_EXECUTE_ACTIONS_ALL],
      actionDescription: EVM_EXECUTE_SCHEMA_MERGED.actionDescription,
      paramsDescription: EVM_EXECUTE_SCHEMA_MERGED.paramsDescription,
      preflightHooks: lifiPreflightHooks,
    },
  };
}

function getStellarChainPlugin(): ChainPlugin {
  return {
    folderKey: "stellar",
    chainIds: ["stellar"],
    queries: [
      {
        chainIds: ["stellar"],
        queryTypes: STELLAR_SOROSWAP_QUERY_TYPES,
        handler: async (ctx) => {
          const handler = getStellarQueryHandler(ctx.query);
          if (!handler) {
            throw new Error(`Missing Stellar query handler: ${ctx.query}`);
          }
          return handler(ctx);
        },
        schema: {
          queryTypes: STELLAR_SOROSWAP_QUERY_TYPES,
          description: STELLAR_SOROSWAP_QUERY_SCHEMA.description,
          paramsDescription: STELLAR_SOROSWAP_QUERY_SCHEMA.paramsDescription,
        },
      },
    ],
    execute: {
      chainIds: ["stellar"],
      actions: [...STELLAR_TRANSFER_ACTIONS, ...STELLAR_SOROSWAP_EXECUTE_ACTIONS],
      actionDescription: STELLAR_EXECUTE_SCHEMA.actionDescription,
      paramsDescription: STELLAR_EXECUTE_SCHEMA.paramsDescription,
    },
  };
}

const ALL_PLUGINS: Record<ChainFolderKey, () => ChainPlugin> = {
  sui: getSuiChainPlugin,
  evm: getEvmChainPlugin,
  stellar: getStellarChainPlugin,
  solana: () => ({
    folderKey: "solana",
    chainIds: ["solana"],
    queries: [
      {
        chainIds: ["solana"],
        queryTypes: LIFI_QUERY_TYPES,
        handler: async (ctx) => {
          const handler = LIFI_QUERY_HANDLERS[ctx.query];
          if (!handler) {
            throw new Error(`Missing Li-Fi query handler: ${ctx.query}`);
          }
          return handler(ctx);
        },
        schema: {
          queryTypes: LIFI_QUERY_TYPES,
          description: LIFI_QUERY_SCHEMA.description,
          paramsDescription: LIFI_QUERY_SCHEMA.paramsDescription,
        },
      },
    ],
    execute: {
      chainIds: ["solana"],
      actions: ["transfer_native", "transfer_sol", ...LIFI_EXECUTE_ACTIONS],
      actionDescription:
        "transfer_native, transfer_sol. " + LIFI_EXECUTE_SCHEMA.actionDescription,
      paramsDescription:
        "transfer_native: { recipient, amount_atomic }. " + LIFI_EXECUTE_SCHEMA.paramsDescription,
      preflightHooks: lifiPreflightHooks,
    },
  }),
};

function folderKeysForEnabledChains(enabledChains: readonly ChainId[]): ChainFolderKey[] {
  const keys = new Set<ChainFolderKey>();
  for (const chainId of enabledChains) {
    keys.add(chainIdToFolderKey(chainId));
  }
  return [...keys];
}

export function getChainPluginsForEnabledChains(enabledChains: readonly ChainId[]): ChainPlugin[] {
  const keys = folderKeysForEnabledChains(enabledChains);
  return keys.map((key) => ALL_PLUGINS[key]());
}

const QUERY_PERMISSION_GATES: Record<string, keyof AgentPermissions> = {
  flash_loan_quote: "allow_flash_loans",
  deepbook_stake_balance: "allow_governance",
  deepbook_stake_required: "allow_governance",
  deepbook_governance_state: "allow_governance",
  ...Object.fromEntries(DEEPBOOK_MARGIN_QUERIES.map((q) => [q, "allow_margin" as const])),
  ...Object.fromEntries(DEEPBOOK_PREDICT_QUERIES.map((q) => [q, "allow_predict" as const])),
};

const ACTION_PERMISSION_GATES: Record<string, keyof AgentPermissions> = {
  deepbook_flash_loan: "allow_flash_loans",
  deepbook_stake: "allow_governance",
  deepbook_unstake: "allow_governance",
  deepbook_submit_proposal: "allow_governance",
  deepbook_vote: "allow_governance",
  deepbook_margin_submit_proposal: "allow_governance",
  deepbook_margin_vote: "allow_governance",
  deepbook_margin_stake: "allow_governance",
  deepbook_margin_unstake: "allow_governance",
};

function isQueryAllowedByPermissions(
  query: string,
  permissions: AgentPermissions,
): boolean {
  const gate = QUERY_PERMISSION_GATES[query];
  if (!gate) {
    if ((DEEPBOOK_FLASH_LOAN_QUERIES as readonly string[]).includes(query)) {
      return permissions.allow_flash_loans;
    }
    if ((DEEPBOOK_GOVERNANCE_QUERIES as readonly string[]).includes(query)) {
      return permissions.allow_governance;
    }
    if ((DEEPBOOK_MARGIN_QUERIES as readonly string[]).includes(query)) {
      return permissions.allow_margin;
    }
    if ((DEEPBOOK_PREDICT_QUERIES as readonly string[]).includes(query)) {
      return permissions.allow_predict;
    }
    return true;
  }
  return permissions[gate] === true;
}

function isActionAllowedByPermissions(
  action: string,
  permissions: AgentPermissions,
): boolean {
  if (action === "deepbook_flash_loan") {
    return permissions.allow_flash_loans;
  }
  if (
    action === "deepbook_stake" ||
    action === "deepbook_unstake" ||
    action === "deepbook_submit_proposal" ||
    action === "deepbook_vote" ||
    action.startsWith("deepbook_margin_stake") ||
    action.startsWith("deepbook_margin_unstake") ||
    action === "deepbook_margin_submit_proposal" ||
    action === "deepbook_margin_vote"
  ) {
    return permissions.allow_governance;
  }
  if (action.startsWith("deepbook_margin_")) {
    return permissions.allow_margin;
  }
  if (action.startsWith("deepbook_predict_")) {
    return permissions.allow_predict;
  }
  const gate = ACTION_PERMISSION_GATES[action];
  return gate ? permissions[gate] === true : true;
}

export function resolveQueryTypes(context: BuildToolDefinitionsContext): string[] {
  const permissions = context.permissions ?? denyDefaultAgentPermissions();
  const plugins = getChainPluginsForEnabledChains(context.enabledChains);
  const queries = new Set<string>(CORE_QUERY_TYPES);

  for (const plugin of plugins) {
    for (const registration of plugin.queries) {
      for (const queryType of registration.queryTypes) {
        if (isQueryAllowedByPermissions(queryType, permissions)) {
          queries.add(queryType);
        }
      }
    }
  }

  return [...queries];
}

export function resolveExecuteActionDescription(context: BuildToolDefinitionsContext): {
  actionDescription: string;
  paramsDescription: string;
} {
  const permissions = context.permissions ?? denyDefaultAgentPermissions();
  const plugins = getChainPluginsForEnabledChains(context.enabledChains);
  const actionParts: string[] = [];
  const paramParts: string[] = [];

  for (const plugin of plugins) {
    const allowedActions = plugin.execute.actions.filter((action) =>
      isActionAllowedByPermissions(action, permissions),
    );
    if (allowedActions.length > 0) {
      actionParts.push(plugin.execute.actionDescription);
      paramParts.push(plugin.execute.paramsDescription);
    }
  }

  return {
    actionDescription: actionParts.join(" "),
    paramsDescription: paramParts.join(" "),
  };
}

export function resolveQueryHandler(
  chainId: ChainId,
  query: string,
): ChainQueryHandler | null {
  const coreHandler = getCoreQueryHandler(query);
  if (coreHandler) {
    return coreHandler;
  }

  const folderKey = chainIdToFolderKey(chainId);
  const plugin = ALL_PLUGINS[folderKey]();
  for (const registration of plugin.queries) {
    if (
      registration.chainIds.includes(chainId) &&
      (registration.queryTypes as readonly string[]).includes(query)
    ) {
      return registration.handler;
    }
  }

  return null;
}

export function getExecutePreflightHooks(
  enabledChains: readonly ChainId[],
): readonly ExecutePreflightRegistration[] {
  const hooks: ExecutePreflightRegistration[] = [];
  const plugins = getChainPluginsForEnabledChains(enabledChains);
  for (const plugin of plugins) {
    if (plugin.execute.preflightHooks) {
      hooks.push(...plugin.execute.preflightHooks);
    }
  }
  return hooks;
}

export async function runExecutePreflightHooks(
  privyUserId: string,
  input: ExecuteTransactionInput,
  enabledChains: readonly ChainId[],
): Promise<void> {
  const hooks = getExecutePreflightHooks(enabledChains);
  for (const hook of hooks) {
    if (hook.match(input.action)) {
      await hook.run(privyUserId, input);
    }
  }
}

/** All known query types (static fallback for tests / zod). */
export function getAllKnownQueryTypes(): string[] {
  const plugins = (Object.keys(ALL_PLUGINS) as ChainFolderKey[]).map((key) => ALL_PLUGINS[key]());
  const queries = new Set<string>(CORE_QUERY_TYPES);
  for (const plugin of plugins) {
    for (const registration of plugin.queries) {
      for (const queryType of registration.queryTypes) {
        queries.add(queryType);
      }
    }
  }
  return [...queries];
}
