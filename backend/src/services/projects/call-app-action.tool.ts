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
import {
  executeAppActionForInstallation,
  executeAppActionForProject,
} from "./app-action.service.js";
import { findProjectByIdForUser } from "./project.repository.js";

export const CALL_APP_ACTION_TOOL_NAME = "call_app_action" as const;

export const callAppActionInputSchema = z
  .object({
    project_id: z.string().uuid().optional(),
    installation_id: z.string().uuid().optional(),
    action: z.enum(APP_ACTION_NAMES),
    params: z.record(z.string(), z.unknown()).optional().default({}),
    chain_id: chainIdSchema.optional(),
  })
  .refine((value) => Boolean(value.project_id) !== Boolean(value.installation_id), {
    message: "Provide exactly one of project_id or installation_id",
  });

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
      `Action "${action}" is not registered for this app. Call query_chain project_actions first.`,
      {
        app_id: project.id,
        allowed_actions: catalog.actions.map((entry) => entry.name),
      },
    );
  }
}

export const callAppActionToolDefinition = {
  name: CALL_APP_ACTION_TOOL_NAME,
  description:
    "Execute a saved app's on-chain action via the user's agent wallet — same path as clicking a button in the app preview. " +
    "Requires exactly one of project_id (owner's saved project) or installation_id (installed app). " +
    "Use query_chain project_actions { project_id } first to read allowed action names and param fields.",
  input_schema: {
    type: "object" as const,
    properties: {
      project_id: {
        type: "string",
        description: "Saved project UUID (owner). Mutually exclusive with installation_id.",
      },
      installation_id: {
        type: "string",
        description: "Installed app UUID. Mutually exclusive with project_id.",
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

  if (parsed.project_id) {
    const project = await findProjectByIdForUser(parsed.project_id, user.id);
    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    }
    assertActionInProjectSchema(project, parsed.action);
    return executeAppActionForProject(
      privyUserId,
      parsed.project_id,
      parsed.action,
      parsed.params,
      actionContext,
    );
  }

  const installation = await findInstallationForUser(parsed.installation_id!, user.id);
  if (!installation) {
    throw new AppError(404, "INSTALLATION_NOT_FOUND", "Installation not found");
  }
  assertActionInProjectSchema(installation.source_project, parsed.action);
  return executeAppActionForInstallation(
    privyUserId,
    parsed.installation_id!,
    parsed.action,
    parsed.params,
    actionContext,
  );
}
