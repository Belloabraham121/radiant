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

/** Registered prompt module ids — extended in later phases. */
export type PromptModuleId =
  | "core:personality"
  | "core:tool-routing"
  | "core:permissions"
  | "core:errors";

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
  /** Lower values appear earlier in the composed system prompt. */
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
};
