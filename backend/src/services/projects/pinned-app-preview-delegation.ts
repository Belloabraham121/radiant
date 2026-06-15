import {
  agentStreamContextFromToolOptions,
  emitAgentStreamExecuteInApp,
} from "../agent/agent-stream-execution.js";
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
  return {
    status: "preview_delegated",
    action,
    message: `Running ${action} in ${appName} — follow the flow in the preview and confirm there.`,
  };
}

export function delegateAppActionToPreview(
  options: AgentToolOptions,
  action: AppActionName,
  params: Record<string, unknown>,
): AppActionResult {
  const streamCtx = agentStreamContextFromToolOptions(options);
  emitAgentStreamExecuteInApp(streamCtx, action, params);
  return buildPreviewDelegatedResult(action, options.pinnedAppScope);
}
