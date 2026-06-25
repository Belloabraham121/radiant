import type { BalanceContext, ChainId, ExecuteTransactionInput } from "../../chains/types.js";
import type { AgentToolOptions } from "../execute-transaction-context.js";
import type { QueryChainResult } from "../agent.types.js";
import type { AgentPermissions } from "../agent-permissions.types.js";

/** Folder key under `agent/chains/` — `ethereum` chain_id maps to `evm`. */
export type ChainFolderKey = "sui" | "evm" | "stellar" | "solana";

export function chainIdToFolderKey(chainId: ChainId): ChainFolderKey {
  if (chainId === "ethereum") {
    return "evm";
  }
  return chainId;
}

export type QueryHandlerContext = {
  privyUserId: string;
  chainId: ChainId;
  query: string;
  params: Record<string, unknown>;
  walletAddress: string;
  balanceContext?: BalanceContext;
  options?: Pick<AgentToolOptions, "flashLoanTurnIntent" | "sessionId" | "pinnedAppScope">;
};

export type ChainQueryHandler = (ctx: QueryHandlerContext) => Promise<QueryChainResult>;

export type QuerySchemaFragment = {
  queryTypes: readonly string[];
  /** Appended to the base query enum description. */
  description: string;
  /** Appended to the base params description. */
  paramsDescription?: string;
};

export type ChainQueryRegistration = {
  /** Queries handled only when `chain_id` matches one of these chains. */
  chainIds: readonly ChainId[];
  queryTypes: readonly string[];
  handler: ChainQueryHandler;
  schema: QuerySchemaFragment;
  /** Hide from tool schema when this permission is false. */
  requiresPermission?: keyof AgentPermissions;
};

export type ExecutePreflightHook = (
  privyUserId: string,
  input: ExecuteTransactionInput,
) => Promise<void>;

export type ExecutePreflightRegistration = {
  match: (action: string) => boolean;
  run: ExecutePreflightHook;
};

export type ChainExecuteRegistration = {
  chainIds: readonly ChainId[];
  actions: readonly string[];
  actionDescription: string;
  paramsDescription: string;
  preflightHooks?: readonly ExecutePreflightRegistration[];
  requiresPermission?: keyof AgentPermissions;
};

export type ChainPlugin = {
  folderKey: ChainFolderKey;
  chainIds: readonly ChainId[];
  queries: readonly ChainQueryRegistration[];
  execute: ChainExecuteRegistration;
};

export type BuildToolDefinitionsContext = {
  enabledChains: readonly ChainId[];
  permissions?: AgentPermissions;
};
