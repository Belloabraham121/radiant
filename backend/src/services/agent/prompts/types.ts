import type { ChainId } from "../../chains/types.js";
import type { AgentPermissions } from "../agent-permissions.types.js";
import type { PinnedAppScope } from "../../projects/pinned-app-scope.types.js";

export type PromptScopeMode = "full" | "scoped";

export type PromptLayer =
  | "core"
  | "chain"
  | "protocol"
  | "artifact"
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
  | "artifact:build"
  | "artifact:build:swap-vs-build"
  | "artifact:edit"
  | "artifact:defi-ui"
  | "platform:browsing"
  | "platform:storage"
  | "platform:notifications"
  | "platform:explorer";

export type PromptBuildContext = {
  chainId: ChainId;
  permissions: AgentPermissions;
  memoryBlock?: string;
  pinnedAppScope?: PinnedAppScope | null;
  artifactContextBlock?: string;
  userMessage?: string;
  activeModuleIds?: PromptModuleId[];
  knownAppActions?: string[];
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
  pinnedAppScope?: PinnedAppScope | null;
  /** Current pinned app source injected server-side — not something the user must provide. */
  artifactContextBlock?: string;
  userMessage?: string;
  activeModuleIds?: PromptModuleId[];
  knownAppActions?: string[];
  mode?: PromptScopeMode;
  /** execute_transaction action names from a workflow plan (compound messages). */
  workflowActions?: string[];
  /** query_chain query types from a workflow plan. */
  workflowQueries?: string[];
};
