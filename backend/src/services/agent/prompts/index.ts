import { getDefaultAgentChainId } from "../../../config/chains.js";
import { defaultAgentPermissions } from "../agent-permissions.service.js";
import { formatPinnedAppScopeForPrompt } from "../../projects/pinned-app-scope.types.js";
import {
  ALL_MODULE_IDS,
  buildFullModePromptLines,
  buildScopedModePromptLines,
} from "./registry.js";
import { getDefaultPromptScopeMode, resolvePromptModules } from "./resolve-modules.js";
import {
  buildSystemPromptInputFromContext,
  logPromptScopeMetrics,
  type AgentPromptContext,
} from "./prompt-context.js";
import type { BuildSystemPromptInput, PromptBuildContext, PromptModuleId } from "./types.js";

export type { AgentPromptContext } from "./prompt-context.js";
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
  buildSystemPromptInputFromContext,
  extractWorkflowPromptModules,
  logPromptScopeMetrics,
} from "./prompt-context.js";
export {
  getDefaultPromptScopeMode,
  resolveOptionalPromptModules,
  resolvePromptModules,
  type ResolvePromptModulesInput,
} from "./resolve-modules.js";
export { buildScopedModePromptLines } from "./registry.js";

function toPromptBuildContext(input: BuildSystemPromptInput): PromptBuildContext {
  const chainId = getDefaultAgentChainId();
  const normalized = buildSystemPromptInputFromContext({
    memoryBlock: input.memoryBlock,
    agentPermissions: input.agentPermissions,
    pinnedAppScope: input.pinnedAppScope,
    artifactContextBlock: input.artifactContextBlock,
    promptContext: {
      userMessage: input.userMessage,
      activeModuleIds: input.activeModuleIds,
      knownAppActions: input.knownAppActions,
      mode: input.mode,
      workflowActions: input.workflowActions,
      workflowQueries: input.workflowQueries,
    },
  });

  return {
    chainId,
    permissions: normalized.agentPermissions ?? defaultAgentPermissions(),
    memoryBlock: normalized.memoryBlock,
    pinnedAppScope: normalized.pinnedAppScope,
    artifactContextBlock: normalized.artifactContextBlock,
    userMessage: normalized.userMessage,
    activeModuleIds: normalized.activeModuleIds,
    knownAppActions: normalized.knownAppActions,
    mode: normalized.mode ?? getDefaultPromptScopeMode(),
  };
}

function resolveModuleIdsForBuild(
  ctx: PromptBuildContext,
  input: BuildSystemPromptInput,
): PromptModuleId[] {
  if (ctx.mode === "full") {
    return ALL_MODULE_IDS;
  }
  return resolvePromptModules({
    chainId: ctx.chainId,
    permissions: ctx.permissions,
    userMessage: input.userMessage,
    activeModuleIds: input.activeModuleIds,
    knownAppActions: input.knownAppActions,
    pinnedAppScope: input.pinnedAppScope,
    workflowActions: input.workflowActions,
    workflowQueries: input.workflowQueries,
  });
}

/**
 * Composes the agent system prompt via the module registry.
 * Scoped mode (default): core + resolved optional modules. Full mode: all modules.
 */
export function buildSystemPrompt(input: BuildSystemPromptInput = {}): string {
  const ctx = toPromptBuildContext(input);
  const moduleIds = resolveModuleIdsForBuild(ctx, input);
  const lines =
    ctx.mode === "full"
      ? buildFullModePromptLines(ctx)
      : buildScopedModePromptLines(ctx, moduleIds);

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

  const prompt = lines.join("\n");
  logPromptScopeMetrics({
    mode: ctx.mode ?? getDefaultPromptScopeMode(),
    userMessage: input.userMessage,
    prompt,
    moduleIds,
  });

  return prompt;
}
