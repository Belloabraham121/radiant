import { getDefaultAgentChainId } from "../../../config/chains.js";
import { defaultAgentPermissions } from "../agent-permissions.service.js";
import { formatPinnedAppScopeForPrompt } from "../../projects/pinned-app-scope.types.js";
import { buildFullModePromptLines, buildScopedModePromptLines } from "./registry.js";
import {
  getDefaultPromptScopeMode,
  resolvePromptModules,
} from "./resolve-modules.js";
import type { BuildSystemPromptInput, PromptBuildContext } from "./types.js";

export type { BuildSystemPromptInput, PromptModuleId, PromptScopeMode } from "./types.js";
export { DEEPBOOK_MARGIN_RADIANT_ID_GUIDE } from "./protocols/deepbook/margin.js";
export {
  ALL_MODULE_IDS,
  ALL_PROMPT_MODULES,
  CORE_MODULE_IDS,
  PROMPT_MODULES,
} from "./registry.js";
export {
  DEEPBOOK_MARGIN_EXECUTE_ACTIONS,
  DEEPBOOK_PREDICT_EXECUTE_ACTIONS,
  QUERY_TYPE_PROMPT_MODULES,
  listMappedPromptModuleIds,
  resolvePromptModulesForExecuteAction,
  resolvePromptModulesForQueryType,
} from "./action-module-map.js";
export { PROMPT_MODULE_TRIGGERS } from "./module-triggers.js";
export {
  getDefaultPromptScopeMode,
  resolveOptionalPromptModules,
  resolvePromptModules,
  type ResolvePromptModulesInput,
} from "./resolve-modules.js";
export { buildScopedModePromptLines } from "./registry.js";

function toPromptBuildContext(input: BuildSystemPromptInput): PromptBuildContext {
  const chainId = getDefaultAgentChainId();
  const mode = input.mode ?? getDefaultPromptScopeMode();
  return {
    chainId,
    permissions: input.agentPermissions ?? defaultAgentPermissions(),
    memoryBlock: input.memoryBlock,
    pinnedAppScope: input.pinnedAppScope,
    artifactContextBlock: input.artifactContextBlock,
    userMessage: input.userMessage,
    activeModuleIds: input.activeModuleIds,
    knownAppActions: input.knownAppActions,
    mode,
  };
}

/**
 * Composes the agent system prompt via the module registry.
 * Full mode (default): all modules. Scoped mode: core + resolved optional modules.
 */
export function buildSystemPrompt(input: BuildSystemPromptInput = {}): string {
  const ctx = toPromptBuildContext(input);
  const lines =
    ctx.mode === "full"
      ? buildFullModePromptLines(ctx)
      : buildScopedModePromptLines(
          ctx,
          resolvePromptModules({
            chainId: ctx.chainId,
            permissions: ctx.permissions,
            userMessage: input.userMessage,
            activeModuleIds: input.activeModuleIds,
            knownAppActions: input.knownAppActions,
            pinnedAppScope: input.pinnedAppScope,
            workflowActions: input.workflowActions,
            workflowQueries: input.workflowQueries,
          }),
        );

  if (input.pinnedAppScope) {
    lines.push("", formatPinnedAppScopeForPrompt(input.pinnedAppScope));
  }

  if (input.artifactContextBlock?.trim()) {
    lines.push("", input.artifactContextBlock.trim());
  }

  const memory = input.memoryBlock?.trim();
  if (memory) {
    lines.push("", "User memory:", memory);
  }

  return lines.join("\n");
}
