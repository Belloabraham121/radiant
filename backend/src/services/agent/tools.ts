import { AppError } from "../../errors/app-error.js";
import { mapAgentToolError } from "../../utils/agent-tool-errors.js";
import type { ExecuteTransactionInput } from "../chains/types.js";
import type { QueryChainInput } from "./agent.types.js";
import {
  EXECUTE_TRANSACTION_TOOL_NAME,
} from "./tools/execute-transaction.tool.js";
import { runExecuteTransactionToolWithApproval } from "./execute-transaction-with-approval.js";
import {
  QUERY_CHAIN_TOOL_NAME,
  runQueryChainTool,
} from "./tools/query-chain.tool.js";
import {
  DEPLOY_APP_TOOL_NAME,
  deployAppToolDefinition,
  runDeployAppTool,
} from "../projects/deploy-app.tool.js";
import {
  GENERATE_APP_TOOL_NAME,
  generateAppToolDefinition,
  runGenerateAppTool,
} from "../projects/generate-app.tool.js";
import {
  LIST_SESSION_PROJECTS_TOOL_NAME,
  listSessionProjectsToolDefinition,
  runListSessionProjectsTool,
} from "../projects/list-session-projects.tool.js";
import {
  LIST_PUBLIC_APPS_TOOL_NAME,
  listPublicAppsToolDefinition,
  runListPublicAppsTool,
} from "../projects/list-public-apps.tool.js";
import {
  INSTALL_APP_TOOL_NAME,
  installAppToolDefinition,
  runInstallAppTool,
} from "../projects/install-app.tool.js";
import {
  PUBLISH_APP_TOOL_NAME,
  publishAppToolDefinition,
  runPublishAppTool,
} from "../projects/publish-app.tool.js";
import {
  SAVE_PROJECT_TOOL_NAME,
  saveProjectToolDefinition,
  runSaveProjectTool,
} from "../projects/save-project.tool.js";
import {
  CALL_APP_ACTION_TOOL_NAME,
  callAppActionToolDefinition,
  runCallAppActionTool,
} from "../projects/call-app-action.tool.js";
import {
  EDIT_APP_TOOL_NAME,
  editAppToolDefinition,
  runEditAppTool,
} from "../projects/edit-app.tool.js";
import {
  READ_ARTIFACT_TOOL_NAME,
  readArtifactToolDefinition,
  runReadArtifactTool,
} from "../projects/read-artifact.tool.js";
import {
  mergePinnedAppScopeIntoArtifactTool,
} from "../projects/pinned-app-scope.types.js";
import type { UpdateMemoryInput } from "../memory/agent-memory.types.js";
import {
  UPDATE_MEMORY_TOOL_NAME,
  updateMemoryToolDefinition,
  runUpdateMemoryTool,
} from "./update-memory.tool.js";
import {
  WEB_SEARCH_TOOL_NAME,
  webSearchToolDefinition,
  runWebSearchTool,
} from "./browsing/web-search.tool.js";
import {
  BROWSE_WEBPAGE_TOOL_NAME,
  browseWebpageToolDefinition,
  runBrowseWebpageTool,
} from "./browsing/browse-webpage.tool.js";
import {
  CALL_API_TOOL_NAME,
  callApiToolDefinition,
  runCallApiTool,
} from "./browsing/call-api.tool.js";
import {
  CREATE_NOTIFICATION_RULE_TOOL_NAME,
  DELETE_NOTIFICATION_RULE_TOOL_NAME,
  LIST_NOTIFICATION_RULES_TOOL_NAME,
  UPDATE_NOTIFICATION_RULE_TOOL_NAME,
  notificationRuleToolDefinitions,
  runCreateNotificationRuleTool,
  runDeleteNotificationRuleTool,
  runListNotificationRulesTool,
  runUpdateNotificationRuleTool,
} from "../notifications/notification-rules.tool.js";
import type { AgentToolOptions } from "./execute-transaction-context.js";
import {
  buildAgentChainToolDefinitions,
  staticToolDefinitionsContext,
} from "./tools/build-tool-definitions.js";
import type { BuildToolDefinitionsContext } from "./chains/types.js";
import type { AgentToolDefinition } from "./runtime/openai-tools.js";
import type { AgentPermissions } from "./agent-permissions.types.js";
import { getEnabledChainConfigs } from "../../config/chains.js";
import { denyDefaultAgentPermissions } from "./agent-permissions.service.js";

export type { BuildToolDefinitionsContext };

export function buildAgentToolDefinitions(context: BuildToolDefinitionsContext): AgentToolDefinition[] {
  const [executeTx, queryChain] = buildAgentChainToolDefinitions(context);
  return [
    executeTx,
    callAppActionToolDefinition,
    queryChain,
    updateMemoryToolDefinition,
    listSessionProjectsToolDefinition,
    generateAppToolDefinition,
    editAppToolDefinition,
    readArtifactToolDefinition,
    deployAppToolDefinition,
    listPublicAppsToolDefinition,
    installAppToolDefinition,
    publishAppToolDefinition,
    saveProjectToolDefinition,
    webSearchToolDefinition,
    browseWebpageToolDefinition,
    callApiToolDefinition,
    ...notificationRuleToolDefinitions,
  ];
}

export function buildAgentToolDefinitionsForRuntime(
  permissions?: AgentPermissions,
): AgentToolDefinition[] {
  return buildAgentToolDefinitions({
    enabledChains: getEnabledChainConfigs().map((config) => config.id),
    permissions: permissions ?? denyDefaultAgentPermissions(),
  });
}

export const agentToolDefinitions = buildAgentToolDefinitions(
  staticToolDefinitionsContext(),
);

export type AgentToolErrorResult = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

function toToolErrorResult(err: AppError): AgentToolErrorResult {
  return {
    error: {
      code: err.code,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    },
  };
}

type AgentToolHandler = (
  privyUserId: string,
  name: string,
  input: Record<string, unknown>,
  options?: AgentToolOptions,
) => Promise<unknown>;

let agentToolHandler: AgentToolHandler | null = null;

/** Test hook — inject tool handler for workflow/orchestration tests. */
export function setAgentToolHandlerForTests(handler: AgentToolHandler | null): void {
  agentToolHandler = handler;
}

async function dispatchAgentTool(
  privyUserId: string,
  name: string,
  input: Record<string, unknown>,
  options?: AgentToolOptions,
): Promise<unknown> {
  if (agentToolHandler) {
    return agentToolHandler(privyUserId, name, input, options);
  }

  try {
    switch (name) {
      case QUERY_CHAIN_TOOL_NAME:
        return await runQueryChainTool(
          privyUserId,
          input as QueryChainInput,
          options,
        );
      case EXECUTE_TRANSACTION_TOOL_NAME:
        return await runExecuteTransactionToolWithApproval(
          privyUserId,
          input as ExecuteTransactionInput,
          {
            sessionId: options?.sessionId,
            messageId: options?.messageId,
            broadcast: Boolean(options?.sessionId),
          },
        );
      case CALL_APP_ACTION_TOOL_NAME:
        return await runCallAppActionTool(privyUserId, input, {
          sessionId: options?.sessionId,
          messageId: options?.messageId,
          pinnedAppScope: options?.pinnedAppScope,
          broadcast: Boolean(options?.sessionId),
        });
      case UPDATE_MEMORY_TOOL_NAME:
        return await runUpdateMemoryTool(privyUserId, input as UpdateMemoryInput);
      case LIST_SESSION_PROJECTS_TOOL_NAME:
        return await runListSessionProjectsTool(privyUserId, input, {
          sessionId: options?.sessionId,
        });
      case GENERATE_APP_TOOL_NAME: {
        const mergedInput = mergePinnedAppScopeIntoArtifactTool(
          input,
          options?.pinnedAppScope,
        );
        return await runGenerateAppTool(privyUserId, mergedInput, {
          sessionId: options?.sessionId,
          rawArguments: options?.rawArguments,
          pinnedAppScope: options?.pinnedAppScope,
        });
      }
      case EDIT_APP_TOOL_NAME: {
        const mergedInput = mergePinnedAppScopeIntoArtifactTool(
          input,
          options?.pinnedAppScope,
        );
        return await runEditAppTool(privyUserId, mergedInput, {
          sessionId: options?.sessionId,
          pinnedAppScope: options?.pinnedAppScope,
        });
      }
      case READ_ARTIFACT_TOOL_NAME:
        return await runReadArtifactTool(privyUserId, input, {
          sessionId: options?.sessionId,
          pinnedAppScope: options?.pinnedAppScope,
        });
      case DEPLOY_APP_TOOL_NAME:
        return await runDeployAppTool(privyUserId, input, {
          sessionId: options?.sessionId,
          pinnedAppScope: options?.pinnedAppScope,
        });
      case LIST_PUBLIC_APPS_TOOL_NAME:
        return await runListPublicAppsTool(privyUserId, input);
      case INSTALL_APP_TOOL_NAME:
        return await runInstallAppTool(privyUserId, input);
      case PUBLISH_APP_TOOL_NAME:
        return await runPublishAppTool(privyUserId, input);
      case SAVE_PROJECT_TOOL_NAME:
        return await runSaveProjectTool(privyUserId, input, {
          sessionId: options?.sessionId,
        });
      case WEB_SEARCH_TOOL_NAME:
        return await runWebSearchTool(privyUserId, input);
      case BROWSE_WEBPAGE_TOOL_NAME:
        return await runBrowseWebpageTool(privyUserId, input);
      case CALL_API_TOOL_NAME:
        return await runCallApiTool(privyUserId, input);
      case CREATE_NOTIFICATION_RULE_TOOL_NAME:
        return await runCreateNotificationRuleTool(privyUserId, input, {
          sessionId: options?.sessionId,
          pinnedAppScope: options?.pinnedAppScope,
        });
      case LIST_NOTIFICATION_RULES_TOOL_NAME:
        return await runListNotificationRulesTool(privyUserId, input, {
          pinnedAppScope: options?.pinnedAppScope,
        });
      case UPDATE_NOTIFICATION_RULE_TOOL_NAME:
        return await runUpdateNotificationRuleTool(privyUserId, input);
      case DELETE_NOTIFICATION_RULE_TOOL_NAME:
        return await runDeleteNotificationRuleTool(privyUserId, input);
      default:
        throw new AppError(400, "UNKNOWN_TOOL", `Unknown agent tool: ${name}`);
    }
  } catch (err) {
    return toToolErrorResult(mapAgentToolError(err));
  }
}

export async function runAgentTool(
  privyUserId: string,
  name: string,
  input: Record<string, unknown>,
  options?: AgentToolOptions,
): Promise<unknown> {
  return dispatchAgentTool(privyUserId, name, input, options);
}

export { runExecuteTransactionToolWithApproval } from "./execute-transaction-with-approval.js";
