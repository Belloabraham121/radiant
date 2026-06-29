import type { ChainId } from "../../chains/types.js";
import type { AgentPermissions } from "../agent-permissions.types.js";
import { classifyFlashLoanTurnIntent } from "../deepbook/flash-loan-turn-intent.js";
import {
  detectInstructionMode,
  parseSwapExecutionIntent,
} from "../execution-intent.js";
import {
  resolvePromptModulesForExecuteAction,
  resolvePromptModulesForQueryType,
} from "./action-module-map.js";
import { getDefaultPromptScopeMode as readPromptScopeModeFromConfig } from "../../../config/agent.js";
import { CORE_MODULE_IDS, PROMPT_MODULES } from "./registry.js";
import { PROMPT_MODULE_TRIGGERS } from "./module-triggers.js";
import type { PromptLayer, PromptModuleId, PromptScopeMode } from "./types.js";

export type ResolvePromptModulesInput = {
  chainId: ChainId;
  permissions: AgentPermissions;
  userMessage?: string;
  activeModuleIds?: PromptModuleId[];
  /** execute_transaction action names from a workflow plan (compound messages). */
  workflowActions?: string[];
  /** query_chain query types from a workflow plan. */
  workflowQueries?: string[];
};

const SUI_DEFAULT_SWAP_MODULE_IDS: PromptModuleId[] = [
  "protocol:deepbook:env",
  "protocol:deepbook:swap",
];

export function getDefaultPromptScopeMode(): PromptScopeMode {
  return readPromptScopeModeFromConfig();
}

function addOptionalModules(target: Set<PromptModuleId>, ids: readonly PromptModuleId[]): void {
  for (const id of ids) {
    if (!CORE_MODULE_IDS.includes(id)) {
      target.add(id);
    }
  }
}

function triggerMatchesMessage(
  trigger: NonNullable<(typeof PROMPT_MODULE_TRIGGERS)[PromptModuleId]>,
  message: string,
  chainId: ChainId,
  permissions: AgentPermissions,
): boolean {
  if (trigger.chains && !trigger.chains.includes(chainId)) {
    return false;
  }
  if (
    trigger.requiresPermission &&
    !permissions[trigger.requiresPermission]
  ) {
    return false;
  }
  if (trigger.keywords?.some((pattern) => pattern.test(message))) {
    return true;
  }
  return false;
}

function addModulesFromMessageKeywords(
  optional: Set<PromptModuleId>,
  message: string,
  chainId: ChainId,
  permissions: AgentPermissions,
  allowedLayers?: readonly PromptLayer[],
): void {
  for (const [moduleId, trigger] of Object.entries(PROMPT_MODULE_TRIGGERS) as [
    PromptModuleId,
    NonNullable<(typeof PROMPT_MODULE_TRIGGERS)[PromptModuleId]>,
  ][]) {
    if (!trigger) {
      continue;
    }
    if (allowedLayers && !allowedLayers.includes(PROMPT_MODULES[moduleId].layer)) {
      continue;
    }
    if (triggerMatchesMessage(trigger, message, chainId, permissions)) {
      optional.add(moduleId);
    }
  }
}

function addModulesFromInstructionMode(
  optional: Set<PromptModuleId>,
  message: string,
  chainId: ChainId,
): void {
  if (parseSwapExecutionIntent(message)) {
    addOptionalModules(optional, SUI_DEFAULT_SWAP_MODULE_IDS);
  }

  const flashLoanIntent = classifyFlashLoanTurnIntent(message);
  if (flashLoanIntent) {
    optional.add("protocol:deepbook:env");
    optional.add("protocol:deepbook:flash-loan");
  }

  const instructionMode = detectInstructionMode(message);
  if (instructionMode === "execution" && chainId === "sui") {
    addOptionalModules(optional, SUI_DEFAULT_SWAP_MODULE_IDS);
  }
}

function addModulesFromWorkflowPlan(
  optional: Set<PromptModuleId>,
  workflowActions: string[] | undefined,
  workflowQueries: string[] | undefined,
): void {
  for (const action of workflowActions ?? []) {
    addOptionalModules(optional, resolvePromptModulesForExecuteAction(action));
  }
  for (const query of workflowQueries ?? []) {
    addOptionalModules(optional, resolvePromptModulesForQueryType(query));
  }
}

export function resolveOptionalPromptModules(input: ResolvePromptModulesInput): PromptModuleId[] {
  const optional = new Set<PromptModuleId>();
  const message = input.userMessage?.trim() ?? "";

  if (input.activeModuleIds?.length) {
    addOptionalModules(optional, input.activeModuleIds);
  }

  if (message) {
    addModulesFromMessageKeywords(optional, message, input.chainId, input.permissions);
    addModulesFromInstructionMode(optional, message, input.chainId);
  }

  addModulesFromWorkflowPlan(optional, input.workflowActions, input.workflowQueries);

  return [...optional];
}

export function resolvePromptModules(input: ResolvePromptModulesInput): PromptModuleId[] {
  const optional = resolveOptionalPromptModules(input);
  return [...CORE_MODULE_IDS, ...optional];
}
