import { AppError } from "../../errors/app-error.js";
import { mapAgentToolError } from "../../utils/agent-tool-errors.js";
import type { ExecuteTransactionInput } from "../chains/types.js";
import type { QueryChainInput } from "./agent.types.js";
import {
  EXECUTE_TRANSACTION_TOOL_NAME,
  executeTransactionToolDefinition,
} from "./execute-transaction.tool.js";
import { runExecuteTransactionToolWithApproval } from "./execute-transaction-with-approval.js";
import {
  QUERY_CHAIN_TOOL_NAME,
  queryChainToolDefinition,
  runQueryChainTool,
} from "./query-chain.tool.js";
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
import type { UpdateMemoryInput } from "../memory/agent-memory.types.js";
import {
  UPDATE_MEMORY_TOOL_NAME,
  updateMemoryToolDefinition,
  runUpdateMemoryTool,
} from "./update-memory.tool.js";
import type { AgentToolOptions } from "./execute-transaction-context.js";

export const agentToolDefinitions = [
  executeTransactionToolDefinition,
  callAppActionToolDefinition,
  queryChainToolDefinition,
  updateMemoryToolDefinition,
  listSessionProjectsToolDefinition,
  generateAppToolDefinition,
  deployAppToolDefinition,
  listPublicAppsToolDefinition,
  installAppToolDefinition,
  publishAppToolDefinition,
  saveProjectToolDefinition,
] as const;

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
        });
      case UPDATE_MEMORY_TOOL_NAME:
        return await runUpdateMemoryTool(privyUserId, input as UpdateMemoryInput);
      case LIST_SESSION_PROJECTS_TOOL_NAME:
        return await runListSessionProjectsTool(privyUserId, input, {
          sessionId: options?.sessionId,
        });
      case GENERATE_APP_TOOL_NAME:
        return await runGenerateAppTool(privyUserId, input, {
          sessionId: options?.sessionId,
          rawArguments: options?.rawArguments,
        });
      case DEPLOY_APP_TOOL_NAME:
        return await runDeployAppTool(privyUserId, input);
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
