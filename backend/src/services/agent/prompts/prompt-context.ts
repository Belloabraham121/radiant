import { getDefaultPromptScopeMode, getPromptScopeConfig } from "../../../config/agent.js";
import type { AgentPermissions } from "../agent-permissions.types.js";
import type { WorkflowPlan } from "../workflow/workflow.types.js";
import type { PinnedAppScope } from "../../projects/pinned-app-scope.types.js";
import type { BuildSystemPromptInput, PromptModuleId, PromptScopeMode } from "./types.js";

export type AgentPromptContext = {
  userMessage?: string;
  activeModuleIds?: PromptModuleId[];
  knownAppActions?: string[];
  mode?: PromptScopeMode;
  workflowActions?: string[];
  workflowQueries?: string[];
  /** Compound error turns use the full prompt for complete routing context. */
  forceFullMode?: boolean;
};

export function extractWorkflowPromptModules(plan: WorkflowPlan): {
  workflowActions: string[];
  workflowQueries: string[];
} {
  const workflowActions: string[] = [];
  const workflowQueries: string[] = [];

  for (const step of plan.steps) {
    switch (step.kind) {
      case "execute":
        workflowActions.push(step.input.action);
        break;
      case "query":
        workflowQueries.push(step.input.query);
        break;
      case "build":
        workflowActions.push("build");
        break;
      case "app_action":
        workflowActions.push(step.action);
        break;
      default:
        break;
    }
  }

  return { workflowActions, workflowQueries };
}

export function buildSystemPromptInputFromContext(input: {
  memoryBlock?: string;
  agentPermissions?: AgentPermissions;
  pinnedAppScope?: PinnedAppScope | null;
  artifactContextBlock?: string;
  promptContext?: AgentPromptContext;
}): BuildSystemPromptInput {
  const mode: PromptScopeMode = input.promptContext?.forceFullMode
    ? "full"
    : (input.promptContext?.mode ?? getDefaultPromptScopeMode());

  return {
    memoryBlock: input.memoryBlock,
    agentPermissions: input.agentPermissions,
    pinnedAppScope: input.pinnedAppScope,
    artifactContextBlock: input.artifactContextBlock,
    userMessage: input.promptContext?.userMessage,
    activeModuleIds: input.promptContext?.activeModuleIds,
    knownAppActions: input.promptContext?.knownAppActions,
    workflowActions: input.promptContext?.workflowActions,
    workflowQueries: input.promptContext?.workflowQueries,
    mode,
  };
}

export function logPromptScopeMetrics(input: {
  mode: PromptScopeMode;
  userMessage?: string;
  prompt: string;
  moduleIds: PromptModuleId[];
}): void {
  if (!getPromptScopeConfig().logMetrics) {
    return;
  }

  console.info("[prompt-scope]", {
    mode: input.mode,
    moduleCount: input.moduleIds.length,
    charCount: input.prompt.length,
    modules: input.moduleIds,
    messagePreview: input.userMessage?.slice(0, 80) ?? "",
  });
}
