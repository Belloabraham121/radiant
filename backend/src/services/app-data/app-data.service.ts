import { AppError } from "../../errors/app-error.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { findProjectByIdForUser } from "../projects/project.repository.js";
import {
  upsertAppData,
  queryAppData,
  deleteAppData,
  countAppData,
} from "./app-data.repository.js";

export type StoreAppDataInput = {
  collection: string;
  data: Record<string, unknown>;
  key?: string | null;
};

export type QueryAppDataInput = {
  collection: string;
  key?: string | null;
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
};

export type DeleteAppDataInput = {
  collection: string;
  key?: string | null;
  id?: string;
};

export type AppDataRecord = {
  id: string;
  collection: string;
  key: string | null;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AppDataListResult = {
  records: AppDataRecord[];
  total: number;
  limit: number;
  offset: number;
};

function toRecord(row: {
  id: string;
  collection: string;
  key: string | null;
  data: unknown;
  created_at: Date;
  updated_at: Date;
}): AppDataRecord {
  return {
    id: row.id,
    collection: row.collection,
    key: row.key,
    data: row.data as Record<string, unknown>,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

type ResolvedScope = {
  projectId: string;
  userId: bigint;
  installationId?: string | null;
};

async function resolveProjectScope(
  privyUserId: string,
  projectId: string,
): Promise<ResolvedScope> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const project = await findProjectByIdForUser(projectId, user.id);
  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  }

  return { projectId: project.id, userId: user.id };
}

async function resolveInstallationScope(
  privyUserId: string,
  installationId: string,
): Promise<ResolvedScope> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const { prisma } = await import("../../infrastructure/postgres/client.js");
  const installation = await prisma.appInstallation.findFirst({
    where: { id: installationId, user_id: user.id },
    select: { id: true, source_project_id: true },
  });

  if (!installation) {
    throw new AppError(404, "INSTALLATION_NOT_FOUND", "App installation not found");
  }

  return {
    projectId: installation.source_project_id,
    userId: user.id,
    installationId: installation.id,
  };
}

export async function resolveScope(
  privyUserId: string,
  params: { projectId?: string; installationId?: string },
): Promise<ResolvedScope> {
  if (params.installationId) {
    return resolveInstallationScope(privyUserId, params.installationId);
  }
  if (params.projectId) {
    return resolveProjectScope(privyUserId, params.projectId);
  }
  throw new AppError(400, "SCOPE_REQUIRED", "Either project_id or installation_id is required");
}

export async function storeAppDataForUser(
  privyUserId: string,
  scopeParams: { projectId?: string; installationId?: string },
  input: StoreAppDataInput,
): Promise<AppDataRecord> {
  const scope = await resolveScope(privyUserId, scopeParams);

  if (!input.collection || input.collection.length > 100) {
    throw new AppError(400, "INVALID_COLLECTION", "Collection name must be 1-100 characters");
  }

  if (input.key && input.key.length > 255) {
    throw new AppError(400, "INVALID_KEY", "Key must be 1-255 characters");
  }

  const row = await upsertAppData({
    projectId: scope.projectId,
    installationId: scope.installationId,
    userId: scope.userId,
    collection: input.collection,
    key: input.key ?? null,
    data: input.data,
  });

  return toRecord(row);
}

export async function queryAppDataForUser(
  privyUserId: string,
  scopeParams: { projectId?: string; installationId?: string },
  input: QueryAppDataInput,
): Promise<AppDataListResult> {
  const scope = await resolveScope(privyUserId, scopeParams);

  const limit = Math.min(input.limit ?? 50, 200);
  const offset = input.offset ?? 0;

  const [rows, total] = await Promise.all([
    queryAppData({
      projectId: scope.projectId,
      userId: scope.userId,
      collection: input.collection,
      installationId: scope.installationId,
      key: input.key,
      limit,
      offset,
      order: input.order,
    }),
    countAppData({
      projectId: scope.projectId,
      userId: scope.userId,
      collection: input.collection,
      installationId: scope.installationId,
    }),
  ]);

  return {
    records: rows.map(toRecord),
    total,
    limit,
    offset,
  };
}

export async function deleteAppDataForUser(
  privyUserId: string,
  scopeParams: { projectId?: string; installationId?: string },
  input: DeleteAppDataInput,
): Promise<{ deleted: number }> {
  const scope = await resolveScope(privyUserId, scopeParams);

  const count = await deleteAppData({
    projectId: scope.projectId,
    userId: scope.userId,
    collection: input.collection,
    installationId: scope.installationId,
    key: input.key,
    id: input.id,
  });

  return { deleted: count };
}
