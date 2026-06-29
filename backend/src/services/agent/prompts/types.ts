import type { ChainId } from "../../chains/types.js";
import type { AgentPermissions } from "../agent-permissions.types.js";

export type PromptScopeMode = "full" | "scoped";

export type PromptLayer =
  | "core"
  | "chain"
  | "protocol"
  | "fiat"
  | "platform";

/** Registered prompt module ids. */
export type PromptModuleId =
  | "core:personality"
  | "core:personality:context"
  | "core:tool-routing"
  | "core:tool-routing:overview"
  | "core:tool-routing:workflow"
  | "core:permissions"
  | "core:defi-guardrails"
  | "core:errors"
  | "protocol:deepbook:env"
  | "protocol:deepbook:balance"
  | "protocol:deepbook:swap"
  | "protocol:deepbook:orders"
  | "protocol:deepbook:flash-loan"
  | "protocol:deepbook:stake"
  | "protocol:deepbook:governance"
  | "protocol:deepbook:margin"
  | "protocol:deepbook:predict"
  | "protocol:lifi:env"
  | "protocol:lifi:swap"
  | "protocol:lifi:bridge"
  | "protocol:cross-chain:fallback"
  | "protocol:soroswap:env"
  | "protocol:soroswap:swap"
  | "protocol:stellar:routing-fallback"
  | "platform:browsing"
  | "platform:notifications";

export type PromptBuildContext = {
  chainId: ChainId;
  permissions: AgentPermissions;
  memoryBlock?: string;
  userMessage?: string;
  activeModuleIds?: PromptModuleId[];
  mode?: PromptScopeMode;
};

export type PromptTrigger = {
  keywords?: RegExp[];
  executeActions?: string[];
  queryTypes?: string[];
  requiresPermission?: keyof AgentPermissions;
  chains?: ChainId[];
};

export type PromptModule = {
  id: PromptModuleId;
  layer: PromptLayer;
  /** Lower values appear earlier when modules are sorted by order alone. */
  order: number;
  build: (ctx: PromptBuildContext) => string[];
  triggers?: PromptTrigger;
};

export type BuildSystemPromptInput = {
  memoryBlock?: string;
  agentPermissions?: AgentPermissions;
  userMessage?: string;
  activeModuleIds?: PromptModuleId[];
  mode?: PromptScopeMode;
  /** execute_transaction action names from a workflow plan (compound messages). */
  workflowActions?: string[];
  /** query_chain query types from a workflow plan. */
  workflowQueries?: string[];
};
