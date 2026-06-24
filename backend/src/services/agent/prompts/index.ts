import { getDefaultAgentChainId } from "../../../config/chains.js";
import { defaultAgentPermissions } from "../agent-permissions.service.js";
import { formatPinnedAppScopeForPrompt } from "../../projects/pinned-app-scope.types.js";
import { buildFullModePromptLines } from "./registry.js";
import type { BuildSystemPromptInput, PromptBuildContext } from "./types.js";

export type { BuildSystemPromptInput, PromptModuleId, PromptScopeMode } from "./types.js";
export { DEEPBOOK_MARGIN_RADIANT_ID_GUIDE } from "./protocols/deepbook/margin.js";
export {
  ALL_MODULE_IDS,
  ALL_PROMPT_MODULES,
  CORE_MODULE_IDS,
  PROMPT_MODULES,
} from "./registry.js";

function toPromptBuildContext(input: BuildSystemPromptInput): PromptBuildContext {
  const chainId = getDefaultAgentChainId();
  return {
    chainId,
    permissions: input.agentPermissions ?? defaultAgentPermissions(),
    memoryBlock: input.memoryBlock,
    pinnedAppScope: input.pinnedAppScope,
    artifactContextBlock: input.artifactContextBlock,
    userMessage: input.userMessage,
    activeModuleIds: input.activeModuleIds,
    knownAppActions: input.knownAppActions,
    mode: input.mode ?? "full",
  };
}

/**
 * Composes the agent system prompt via the module registry (full mode).
 * Scoped mode (Phase 4) will select modules via resolve-modules.ts.
 */
export function buildSystemPrompt(input: BuildSystemPromptInput = {}): string {
  const ctx = toPromptBuildContext(input);
  const lines = [...buildFullModePromptLines(ctx)];

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
