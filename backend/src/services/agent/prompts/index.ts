import { getDefaultAgentChainId } from "../../../config/chains.js";
import { defaultAgentPermissions } from "../agent-permissions.service.js";
import { formatPinnedAppScopeForPrompt } from "../../projects/pinned-app-scope.types.js";
import {
  buildCoreErrorsModuleLines,
  buildCoreModuleLines,
  buildPersonalityThreadContextLines,
  buildToolRoutingOverviewModuleLines,
  buildToolRoutingWorkflowInterleavedLines,
} from "./registry.js";
import {
  buildLegacyRestLinesAfterWorkflowAfterErrors,
  buildLegacyRestLinesAfterWorkflowBeforeErrors,
  buildLegacyRestLinesBeforeWorkflow,
} from "./legacy-rest.js";
import type { BuildSystemPromptInput, PromptBuildContext } from "./types.js";

export type { BuildSystemPromptInput, PromptModuleId, PromptScopeMode } from "./types.js";
export { MARGIN_RADIANT_ID_GUIDE } from "./legacy-rest.js";

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
 * Composes the agent system prompt. Phase 1: core modules + legacy remainder (full output parity).
 * Scoped mode (Phase 4) will select modules via resolve-modules.ts.
 */
export function buildSystemPrompt(input: BuildSystemPromptInput = {}): string {
  const ctx = toPromptBuildContext(input);
  const lines = [
    ...buildCoreModuleLines(ctx),
    ...buildToolRoutingOverviewModuleLines(),
    ...buildLegacyRestLinesBeforeWorkflow(ctx),
    ...buildToolRoutingWorkflowInterleavedLines(),
    ...buildLegacyRestLinesAfterWorkflowBeforeErrors(ctx),
    ...buildCoreErrorsModuleLines(),
    ...buildLegacyRestLinesAfterWorkflowAfterErrors(ctx),
    ...buildPersonalityThreadContextLines(),
  ];

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
