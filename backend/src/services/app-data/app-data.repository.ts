/**
 * App data repository — delegates to the active storage provider.
 *
 * This file re-exports the storage types and provides the same function signatures
 * the service layer already imports. Internally it calls getAppDataProvider().
 */
import { getAppDataProvider } from "./app-data.storage.js";
import type {
  AppDataRow,
  AppDataInput,
  AppDataQuery,
  AppDataDeleteQuery,
  SharedAppDataQuery,
} from "./app-data.storage.js";

export type { AppDataRow, AppDataInput, AppDataQuery, AppDataDeleteQuery, SharedAppDataQuery };

export async function upsertAppData(input: AppDataInput): Promise<AppDataRow> {
  return getAppDataProvider().upsert(input);
}

export async function queryAppData(query: AppDataQuery): Promise<AppDataRow[]> {
  return getAppDataProvider().query(query);
}

export async function countAppData(
  query: Pick<AppDataQuery, "projectId" | "userId" | "collection" | "installationId">,
): Promise<number> {
  return getAppDataProvider().count(query);
}

export async function deleteAppData(query: AppDataDeleteQuery): Promise<number> {
  return getAppDataProvider().delete(query);
}

export async function deleteAllAppDataByProjectId(projectId: string): Promise<number> {
  return getAppDataProvider().deleteAllByProjectId(projectId);
}

export async function querySharedAppData(query: SharedAppDataQuery): Promise<AppDataRow[]> {
  return getAppDataProvider().queryShared(query);
}

export async function countSharedAppData(
  query: Pick<SharedAppDataQuery, "projectId" | "collection" | "installationId">,
): Promise<number> {
  return getAppDataProvider().countShared(query);
}
