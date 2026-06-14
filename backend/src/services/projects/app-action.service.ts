import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { findInstallationForUser } from "../apps/app-installation.repository.js";
import { getAppProtocolAdapter } from "../protocols/protocol-adapter-registry.js";
import { resolveAppProtocolId } from "../protocols/resolve-project-protocol.js";
import type { ProjectActionSchemaSource } from "./app-action-schema.service.js";
import { findProjectByIdForUser } from "./project.repository.js";
import type { AppActionContext, AppActionName, AppActionResult } from "./app-action.types.js";
import { mapThrownErrorToAppActionResult } from "./app-action-result.js";

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

async function loadProjectSchemaSource(
  ctx: AppActionContext,
): Promise<ProjectActionSchemaSource | null> {
  const user = await findUserByPrivyId(ctx.privyUserId);
  if (!user) {
    return null;
  }

  if (ctx.projectId) {
    return findProjectByIdForUser(ctx.projectId, user.id);
  }

  if (ctx.installationId) {
    const installation = await findInstallationForUser(ctx.installationId, user.id);
    return installation?.source_project ?? null;
  }

  return null;
}

/**
 * Execute a canonical app action via the protocol adapter registry.
 * DeepBook today; new protocols register an adapter (see docs/protocol-extension-kit.md).
 */
export async function executeAppAction(
  ctx: AppActionContext,
  action: AppActionName,
  params: unknown,
): Promise<AppActionResult> {
  try {
    const project = await loadProjectSchemaSource(ctx);
    const protocolId = resolveAppProtocolId(action, project);
    const adapter = getAppProtocolAdapter(protocolId);

    if (!adapter.supportsAction(action)) {
      throw new AppError(
        400,
        "ACTION_NOT_SUPPORTED_BY_PROTOCOL",
        `Action "${action}" is not supported by protocol "${protocolId}".`,
        {
          action,
          protocol: protocolId,
          supported_actions: [...adapter.supportedActions()],
        },
      );
    }

    return await adapter.execute(action, params, ctx);
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
