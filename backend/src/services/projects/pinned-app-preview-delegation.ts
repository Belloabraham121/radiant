import {
  agentStreamContextFromToolOptions,
  emitAgentStreamExecuteInApp,
} from "../agent/agent-stream-execution.js";
import { emitExecutionProgress } from "../agent/execution-progress-context.js";
import type { AgentToolOptions } from "../agent/execute-transaction-context.js";
import type { AppActionName, AppActionResult } from "./app-action.types.js";
import { scopeDisplayName, type PinnedAppScope } from "./pinned-app-scope.types.js";

/** Pinned @ app + live chat session → drive execution through the preview iframe. */
export function shouldDelegateAppActionToPreview(options: AgentToolOptions): boolean {
  return Boolean(options.pinnedAppScope && options.broadcast && options.sessionId);
}

export function buildPreviewDelegatedResult(
  action: AppActionName,
  pinnedScope: PinnedAppScope | null | undefined,
): AppActionResult {
  const appName = pinnedScope ? scopeDisplayName(pinnedScope) : "your app";
  const label = action.replace(/_/g, " ");
  return {
    status: "preview_delegated",
    action,
    message: `Executing ${label} in ${appName} — watch the app preview to see it in action.`,
  };
}

export function delegateAppActionToPreview(
  options: AgentToolOptions,
  action: AppActionName,
  params: Record<string, unknown>,
): AppActionResult {
  const label = `Execute ${action.replace(/_/g, " ")}`;
  emitExecutionProgress({
    step: {
      id: "execute",
      status: "running",
      label,
      detail: "Running in app preview…",
      status_category: "defi",
    },
  });

  const streamCtx = agentStreamContextFromToolOptions(options);
  emitAgentStreamExecuteInApp(streamCtx, action, params);
  return buildPreviewDelegatedResult(action, options.pinnedAppScope);
}
