import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { findInstallationForUser } from "../apps/app-installation.repository.js";
import { runExecuteTransactionToolWithApproval } from "../agent/execute-transaction-with-approval.js";
import { findProjectByIdForUser } from "./project.repository.js";
import type { AppActionContext, AppActionName, AppActionResult } from "./app-action.types.js";
import {
  buildAgentToolOptionsFromContext,
  mapExecuteOutcomeToAppActionResult,
  mapThrownErrorToAppActionResult,
} from "./app-action-result.js";
import { validateAppActionInput } from "./app-action-mapper.js";

async function assertProjectAccess(privyUserId: string, projectId: string): Promise<void> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }
  const project = await findProjectByIdForUser(projectId, user.id);
  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  }
}

async function assertInstallationAccess(
  privyUserId: string,
  installationId: string,
): Promise<void> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }
  const installation = await findInstallationForUser(installationId, user.id);
  if (!installation) {
    throw new AppError(404, "INSTALLATION_NOT_FOUND", "Installation not found");
  }
  const source = installation.source_project;
  if (!source.is_public || source.status !== "live") {
    throw new AppError(410, "APP_UNAVAILABLE", "This app is no longer available");
  }
}

/**
 * Execute a canonical app action via the same path as chat `execute_transaction`.
 * Uses the authenticated user's agent wallet (Privy).
 */
export async function executeAppAction(
  ctx: AppActionContext,
  action: AppActionName,
  params: unknown,
): Promise<AppActionResult> {
  try {
    const input = validateAppActionInput(action, params, { chain_id: ctx.chainId });
    const outcome = await runExecuteTransactionToolWithApproval(
      ctx.privyUserId,
      input,
      buildAgentToolOptionsFromContext(ctx),
    );
    return mapExecuteOutcomeToAppActionResult(action, outcome);
  } catch (err) {
    return mapThrownErrorToAppActionResult(action, err);
  }
}

/** Project-scoped action — owner auth + agent wallet. */
export async function executeAppActionForProject(
  privyUserId: string,
  projectId: string,
  action: AppActionName,
  params: unknown,
  options: Omit<AppActionContext, "privyUserId" | "projectId"> = { source: "ui" },
): Promise<AppActionResult> {
  await assertProjectAccess(privyUserId, projectId);
  return executeAppAction(
    {
      privyUserId,
      projectId,
      ...options,
    },
    action,
    params,
  );
}

/** Installation-scoped action — installer's agent wallet. */
export async function executeAppActionForInstallation(
  privyUserId: string,
  installationId: string,
  action: AppActionName,
  params: unknown,
  options: Omit<AppActionContext, "privyUserId" | "installationId"> = { source: "ui" },
): Promise<AppActionResult> {
  await assertInstallationAccess(privyUserId, installationId);
  return executeAppAction(
    {
      privyUserId,
      installationId,
      ...options,
    },
    action,
    params,
  );
}
