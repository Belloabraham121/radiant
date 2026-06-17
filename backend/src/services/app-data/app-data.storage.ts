/**
 * Storage provider interface for app data.
 *
 * Phase 1: Postgres (app-data.postgres.ts)
 * Phase 2: Turso / libSQL per-installation databases (app-data.turso.ts)
 *
 * Swap providers by setting APP_DATA_STORAGE=postgres|turso in .env.
 * The service layer and all API routes remain unchanged.
 */

export type AppDataRow = {
  id: string;
  project_id: string;
  installation_id: string | null;
  user_id: bigint;
  collection: string;
  key: string | null;
  data: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

export type AppDataInput = {
  projectId: string;
  installationId?: string | null;
  userId: bigint;
  collection: string;
  key?: string | null;
  data: Record<string, unknown>;
};

export type AppDataQuery = {
  projectId: string;
  userId: bigint;
  collection: string;
  installationId?: string | null;
  key?: string | null;
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
};

export type AppDataDeleteQuery = {
  projectId: string;
  userId: bigint;
  collection: string;
  installationId?: string | null;
  key?: string | null;
  id?: string;
};

export interface AppDataStorageProvider {
  upsert(input: AppDataInput): Promise<AppDataRow>;
  query(query: AppDataQuery): Promise<AppDataRow[]>;
  count(query: Pick<AppDataQuery, "projectId" | "userId" | "collection" | "installationId">): Promise<number>;
  delete(query: AppDataDeleteQuery): Promise<number>;
}

// --- Provider registry ---

let activeProvider: AppDataStorageProvider | null = null;

export function setAppDataProvider(provider: AppDataStorageProvider): void {
  activeProvider = provider;
}

export function getAppDataProvider(): AppDataStorageProvider {
  if (!activeProvider) {
    throw new Error(
      "AppData storage provider not initialized. Call initAppDataStorage() at startup.",
    );
  }
  return activeProvider;
}

export async function initAppDataStorage(): Promise<string> {
  const requested = process.env.APP_DATA_STORAGE ?? "postgres";

  if (requested === "turso") {
    try {
      const { TursoAppDataProvider } = await import("./app-data.turso.js");
      const provider = new TursoAppDataProvider();
      await provider.initialize();
      setAppDataProvider(provider);
      return "turso";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Dynamic import so we don't pull in the logger at module scope
      const { logger } = await import("../../shared/logger.js");
      logger.warn(
        `Turso connection failed — falling back to Postgres. Fix TURSO_DATABASE_URL / TURSO_AUTH_TOKEN and restart. Error: ${msg}`,
      );
      // Fall through to Postgres
    }
  }

  if (requested !== "postgres" && requested !== "turso") {
    throw new Error(`Unknown APP_DATA_STORAGE backend: ${requested}`);
  }

  const { PostgresAppDataProvider } = await import("./app-data.postgres.js");
  setAppDataProvider(new PostgresAppDataProvider());
  return "postgres";
}
