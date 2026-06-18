import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";
import type {
  AppDataStorageProvider,
  AppDataRow,
  AppDataInput,
  AppDataQuery,
  AppDataDeleteQuery,
  SharedAppDataQuery,
} from "./app-data.storage.js";

function toJsonValue(data: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue;
}

function toRow(row: {
  id: string;
  project_id: string;
  installation_id: string | null;
  user_id: bigint;
  collection: string;
  key: string | null;
  data: unknown;
  created_at: Date;
  updated_at: Date;
}): AppDataRow {
  return {
    id: row.id,
    project_id: row.project_id,
    installation_id: row.installation_id,
    user_id: row.user_id,
    collection: row.collection,
    key: row.key,
    data: row.data as Record<string, unknown>,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class PostgresAppDataProvider implements AppDataStorageProvider {
  async upsert(input: AppDataInput): Promise<AppDataRow> {
    if (input.key) {
      const row = await prisma.appData.upsert({
        where: {
          project_id_user_id_collection_key: {
            project_id: input.projectId,
            user_id: input.userId,
            collection: input.collection,
            key: input.key,
          },
        },
        create: {
          project_id: input.projectId,
          installation_id: input.installationId ?? null,
          user_id: input.userId,
          collection: input.collection,
          key: input.key,
          data: toJsonValue(input.data),
        },
        update: {
          data: toJsonValue(input.data),
          installation_id: input.installationId ?? undefined,
        },
      });
      return toRow(row);
    }

    const row = await prisma.appData.create({
      data: {
        project_id: input.projectId,
        installation_id: input.installationId ?? null,
        user_id: input.userId,
        collection: input.collection,
        key: null,
        data: toJsonValue(input.data),
      },
    });
    return toRow(row);
  }

  async query(query: AppDataQuery): Promise<AppDataRow[]> {
    const limit = Math.min(query.limit ?? 50, 200);
    const offset = query.offset ?? 0;
    const order = query.order ?? "desc";

    const rows = await prisma.appData.findMany({
      where: {
        project_id: query.projectId,
        user_id: query.userId,
        collection: query.collection,
        ...(query.installationId ? { installation_id: query.installationId } : {}),
        ...(query.key !== undefined && query.key !== null ? { key: query.key } : {}),
      },
      orderBy: { created_at: order },
      take: limit,
      skip: offset,
    });
    return rows.map(toRow);
  }

  async count(
    query: Pick<AppDataQuery, "projectId" | "userId" | "collection" | "installationId">,
  ): Promise<number> {
    return prisma.appData.count({
      where: {
        project_id: query.projectId,
        user_id: query.userId,
        collection: query.collection,
        ...(query.installationId ? { installation_id: query.installationId } : {}),
      },
    });
  }

  async queryShared(query: SharedAppDataQuery): Promise<AppDataRow[]> {
    const limit = Math.min(query.limit ?? 50, 200);
    const offset = query.offset ?? 0;
    const order = query.order ?? "asc";

    const rows = await prisma.appData.findMany({
      where: {
        project_id: query.projectId,
        collection: query.collection,
        ...(query.since ? { created_at: { gt: new Date(query.since) } } : {}),
      },
      orderBy: { created_at: order },
      take: limit,
      skip: offset,
    });
    return rows.map(toRow);
  }

  async countShared(
    query: Pick<SharedAppDataQuery, "projectId" | "collection">,
  ): Promise<number> {
    return prisma.appData.count({
      where: {
        project_id: query.projectId,
        collection: query.collection,
      },
    });
  }

  async delete(query: AppDataDeleteQuery): Promise<number> {
    if (query.id) {
      const deleted = await prisma.appData.deleteMany({
        where: {
          id: query.id,
          project_id: query.projectId,
          user_id: query.userId,
        },
      });
      return deleted.count;
    }

    const deleted = await prisma.appData.deleteMany({
      where: {
        project_id: query.projectId,
        user_id: query.userId,
        collection: query.collection,
        ...(query.installationId ? { installation_id: query.installationId } : {}),
        ...(query.key !== undefined && query.key !== null ? { key: query.key } : {}),
      },
    });
    return deleted.count;
  }

  async deleteAllByProjectId(projectId: string): Promise<number> {
    const deleted = await prisma.appData.deleteMany({
      where: { project_id: projectId },
    });
    return deleted.count;
  }
}
