import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { findInstallationForUser } from "../apps/app-installation.repository.js";
import { chainIdSchema } from "../chains/types.js";
import { ONCHAIN_ACTION_NAMES, isOnchainAction } from "./app-action-registry.js";
import type { AppActionName, AppActionResult } from "./app-action.types.js";
import {
  buildProjectActionsCatalogResponse,
  type ProjectActionSchemaSource,
} from "./app-action-schema.service.js";
import { resolveAppScope, coerceMislabeledAppScopeFields } from "./app-scope-resolver.service.js";
import { mergePinnedAppScopeIntoCallAppAction } from "./pinned-app-scope.types.js";
import {
  executeAppActionForInstallation,
  executeAppActionForProject,
  executeAppActionForSession,
} from "./app-action.service.js";
import { listAppActionsCatalogForSession } from "./app-action-catalog.service.js";
import { findProjectByIdForUser } from "./project.repository.js";
import type { AgentToolOptions } from "../agent/execute-transaction-context.js";
import {
  delegateAppActionToPreview,
  shouldDelegateAppActionToPreview,
} from "./pinned-app-preview-delegation.js";

export const CALL_APP_ACTION_TOOL_NAME = "call_app_action" as const;

export const callAppActionInputSchema = z.preprocess(
  (input) => {
    if (typeof input !== "object" || input === null) {
      return input;
    }
    return coerceMislabeledAppScopeFields(input as Record<string, unknown>);
  },
  z
    .object({
      project_id: z.string().uuid().optional(),
      installation_id: z.string().uuid().optional(),
      app_name: z.string().min(1).optional(),
      use_session_draft: z.boolean().optional(),
      action: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/),
      params: z.record(z.string(), z.unknown()).optional().default({}),
      chain_id: chainIdSchema.optional(),
    })
    .superRefine((value, ctx) => {
      if (value.project_id && value.installation_id) {
        ctx.addIssue({
          code: "custom",
          message: "Provide at most one of project_id or installation_id",
        });
      }
    }),
);

export type CallAppActionInput = z.infer<typeof callAppActionInputSchema>;

export function assertActionInProjectSchema(
  project: ProjectActionSchemaSource,
  action: AppActionName,
): void {
  if (!isOnchainAction(action)) {
    return;
  }
  const catalog = buildProjectActionsCatalogResponse(project);
  if (!catalog.actions.some((entry) => entry.name === action)) {
    throw new AppError(
      400,
      "ACTION_NOT_IN_SCHEMA",
      `Action "${action}" is not registered for this app. Call query_chain project_actions or session_actions first.`,
      {
        app_id: project.id,
        allowed_actions: catalog.actions.map((entry) => entry.name),
      },
    );
  }
}

async function assertActionInSessionSchema(
  privyUserId: string,
  sessionId: string,
  action: AppActionName,
): Promise<void> {
  if (!isOnchainAction(action)) {
    return;
  }
  const catalog = await listAppActionsCatalogForSession(privyUserId, sessionId);
  if (!catalog.actions.some((entry) => entry.name === action)) {
    throw new AppError(
      400,
      "ACTION_NOT_IN_SCHEMA",
      `Action "${action}" is not registered for this chat draft app.`,
      {
        session_id: sessionId,
        allowed_actions: catalog.actions.map((entry) => entry.name),
      },
    );
  }
}

export const callAppActionToolDefinition = {
  name: CALL_APP_ACTION_TOOL_NAME,
  description:
    "Execute an app action — either on-chain (swap, stake, etc.) or app-local (log_workout, update_reps, etc.). " +
    "On-chain actions go through the transaction pipeline; app-local actions run in the preview UI. " +
    "Call query_chain project_actions or session_actions first to discover which actions this app supports. " +
    "Scope: project_id (saved project UUID), installation_id (installed app UUID), app_name (match by name in this chat), " +
    "or omit all three to use the chat draft when only one app exists. Never pass an app name as project_id.",
  input_schema: {
    type: "object" as const,
    properties: {
      project_id: {
        type: "string",
        description: "Saved project UUID from list_session_projects. Never an app name.",
      },
      installation_id: {
        type: "string",
        description: "Installed app UUID. Mutually exclusive with project_id.",
      },
      app_name: {
        type: "string",
        description:
          "Match a saved project or chat draft by name in this session (e.g. \"Uniswap\", \"my DEX\"). " +
          "Call list_session_projects first when unsure.",
      },
      use_session_draft: {
        type: "boolean",
        description: "Target the unsaved chat artifact draft in this session (no project_id yet).",
      },
      action: {
        type: "string",
        description:
          "Action name from query_chain project_actions / session_actions. " +
          "On-chain: swap, flash_loan, stake, unstake, deposit, withdraw, transfer, etc. " +
          "App-local: any custom action the app declares (e.g. log_workout, update_reps, add_entry). " +
          "Must be lowercase snake_case.",
      },
      params: {
        type: "object",
        description:
          "Action parameters — must match the project action schema. " +
          "On-chain swap: { amount or amount_display, side, pool_key? }. " +
          "App-local: pass params matching the app's declared schema (from project_actions response).",
        additionalProperties: true,
      },
      chain_id: {
        type: "string",
        enum: ["sui", "ethereum", "solana"],
        description: "Optional chain override; defaults from action registry. Only for on-chain actions.",
      },
    },
    required: ["action", "params"] as const,
    additionalProperties: false,
  },
};

export async function runCallAppActionTool(
  privyUserId: string,
  input: Record<string, unknown>,
  context: AgentToolOptions = {},
): Promise<AppActionResult> {
  const parsed = mergePinnedAppScopeIntoCallAppAction(
    callAppActionInputSchema.parse(input),
    context.pinnedAppScope,
  );
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const actionContext = {
    source: "agent" as const,
    sessionId: context.sessionId,
    messageId: context.messageId,
    pinnedAppScope: context.pinnedAppScope ?? null,
    ...(parsed.chain_id ? { chainId: parsed.chain_id } : {}),
  };

  const isAppLocal = !isOnchainAction(parsed.action);

  if (parsed.installation_id) {
    const installation = await findInstallationForUser(parsed.installation_id, user.id);
    if (!installation) {
      throw new AppError(404, "INSTALLATION_NOT_FOUND", "Installation not found");
    }
    assertActionInProjectSchema(installation.source_project, parsed.action);
    if (isAppLocal || shouldDelegateAppActionToPreview(context)) {
      return delegateAppActionToPreview(
        context,
        parsed.action,
        parsed.params as Record<string, unknown>,
      );
    }
    return executeAppActionForInstallation(
      privyUserId,
      parsed.installation_id,
      parsed.action,
      parsed.params,
      actionContext,
    );
  }

  const scope = await resolveAppScope(privyUserId, context.sessionId, {
    project_id: parsed.project_id,
    app_name: parsed.app_name,
    use_session_draft: parsed.use_session_draft,
  });

  if (scope.kind === "session_draft") {
    await assertActionInSessionSchema(privyUserId, scope.session_id, parsed.action);
    if (isAppLocal || shouldDelegateAppActionToPreview(context)) {
      return delegateAppActionToPreview(
        context,
        parsed.action,
        parsed.params as Record<string, unknown>,
      );
    }
    return executeAppActionForSession(
      privyUserId,
      scope.session_id,
      parsed.action,
      parsed.params,
      actionContext,
    );
  }

  const project = await findProjectByIdForUser(scope.project_id, user.id);
  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  }
  assertActionInProjectSchema(project, parsed.action);
  if (isAppLocal || shouldDelegateAppActionToPreview(context)) {
    return delegateAppActionToPreview(
      context,
      parsed.action,
      parsed.params as Record<string, unknown>,
    );
  }
  return executeAppActionForProject(
    privyUserId,
    scope.project_id,
    parsed.action,
    parsed.params,
    actionContext,
  );
}
