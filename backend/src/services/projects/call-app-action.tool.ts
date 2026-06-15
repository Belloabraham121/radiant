import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { findInstallationForUser } from "../apps/app-installation.repository.js";
import { chainIdSchema } from "../chains/types.js";
import { APP_ACTION_NAMES } from "./app-action-registry.js";
import type { AppActionName, AppActionResult } from "./app-action.types.js";
import {
  buildProjectActionsCatalogResponse,
  type ProjectActionSchemaSource,
} from "./app-action-schema.service.js";
import { resolveAppScope, coerceMislabeledAppScopeFields } from "./app-scope-resolver.service.js";
import {
  executeAppActionForInstallation,
  executeAppActionForProject,
  executeAppActionForSession,
} from "./app-action.service.js";
import { listAppActionsCatalogForSession } from "./app-action-catalog.service.js";
import { findProjectByIdForUser } from "./project.repository.js";

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
      action: z.enum(APP_ACTION_NAMES),
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
    "Execute an app's on-chain action via the user's agent wallet — same path as clicking a button in the app preview. " +
    "Scope: project_id (saved project UUID), installation_id (installed app UUID), app_name (match by name in this chat, e.g. \"Uniswap\"), " +
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
        enum: [...APP_ACTION_NAMES],
        description: "Canonical app action name (e.g. swap, stake, flash_loan).",
      },
      params: {
        type: "object",
        description:
          "Action parameters — must match the project action schema. swap: { amount or amount_display, side, pool_key? }. " +
          "stake: { amount_display, pool_key? }. flash_loan: { borrow_amount, asset?, strategy?, steps? }.",
        additionalProperties: true,
      },
      chain_id: {
        type: "string",
        enum: ["sui", "ethereum", "solana"],
        description: "Optional chain override; defaults from action registry.",
      },
    },
    required: ["action", "params"] as const,
    additionalProperties: false,
  },
};

export async function runCallAppActionTool(
  privyUserId: string,
  input: Record<string, unknown>,
  context: { sessionId?: string; messageId?: string } = {},
): Promise<AppActionResult> {
  const parsed = callAppActionInputSchema.parse(input);
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const actionContext = {
    source: "agent" as const,
    sessionId: context.sessionId,
    messageId: context.messageId,
    ...(parsed.chain_id ? { chainId: parsed.chain_id } : {}),
  };

  if (parsed.installation_id) {
    const installation = await findInstallationForUser(parsed.installation_id, user.id);
    if (!installation) {
      throw new AppError(404, "INSTALLATION_NOT_FOUND", "Installation not found");
    }
    assertActionInProjectSchema(installation.source_project, parsed.action);
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
  return executeAppActionForProject(
    privyUserId,
    scope.project_id,
    parsed.action,
    parsed.params,
    actionContext,
  );
}
