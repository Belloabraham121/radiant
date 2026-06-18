import { createClient, type Client, type InValue } from "@libsql/client";
import { logger } from "../../shared/logger.js";
import type {
  AppDataStorageProvider,
  AppDataRow,
  AppDataInput,
  AppDataQuery,
  AppDataDeleteQuery,
  SharedAppDataQuery,
} from "./app-data.storage.js";

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS app_data (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL,
  installation_id TEXT,
  user_id         TEXT NOT NULL,
  collection      TEXT NOT NULL,
  key             TEXT,
  data            TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`;

const CREATE_INDEXES_SQL = [
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_app_data_upsert
     ON app_data(project_id, user_id, collection, key)
     WHERE key IS NOT NULL;`,
  `CREATE INDEX IF NOT EXISTS idx_app_data_query_user
     ON app_data(project_id, user_id, collection, created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_app_data_query_install
     ON app_data(project_id, installation_id, collection, created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_app_data_shared
     ON app_data(project_id, collection, created_at);`,
];

function generateUUID(): string {
  return crypto.randomUUID();
}

function parseRow(row: Record<string, unknown>): AppDataRow {
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    installation_id: (row.installation_id as string) || null,
    user_id: BigInt(row.user_id as string),
    collection: row.collection as string,
    key: (row.key as string) || null,
    data: JSON.parse(row.data as string) as Record<string, unknown>,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
  };
}

export class TursoAppDataProvider implements AppDataStorageProvider {
  private client: Client;

  constructor() {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url) {
      throw new Error("TURSO_DATABASE_URL is required when APP_DATA_STORAGE=turso");
    }

    this.client = createClient({
      url,
      authToken: authToken || undefined,
    });
  }

  async initialize(): Promise<void> {
    await this.client.execute(CREATE_TABLE_SQL);
    for (const sql of CREATE_INDEXES_SQL) {
      await this.client.execute(sql);
    }
    logger.info("Turso app_data table and indexes ensured");
  }

  async upsert(input: AppDataInput): Promise<AppDataRow> {
    const now = new Date().toISOString();
    const jsonData = JSON.stringify(input.data);
    const userId = input.userId.toString();

    if (input.key) {
      // Upsert: try update first, then insert if no rows affected
      const existing = await this.client.execute({
        sql: `SELECT id FROM app_data
              WHERE project_id = ? AND user_id = ? AND collection = ? AND key = ?`,
        args: [input.projectId, userId, input.collection, input.key],
      });

      if (existing.rows.length > 0) {
        const id = existing.rows[0].id as string;
        await this.client.execute({
          sql: `UPDATE app_data
                SET data = ?, installation_id = COALESCE(?, installation_id), updated_at = ?
                WHERE id = ?`,
          args: [
            jsonData,
            (input.installationId ?? null) as InValue,
            now,
            id,
          ],
        });
        return this.getById(id);
      }
    }

    const id = generateUUID();
    await this.client.execute({
      sql: `INSERT INTO app_data (id, project_id, installation_id, user_id, collection, key, data, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        input.projectId,
        (input.installationId ?? null) as InValue,
        userId,
        input.collection,
        (input.key ?? null) as InValue,
        jsonData,
        now,
        now,
      ],
    });

    return this.getById(id);
  }

  async query(query: AppDataQuery): Promise<AppDataRow[]> {
    const limit = Math.min(query.limit ?? 50, 200);
    const offset = query.offset ?? 0;
    const order = (query.order ?? "desc").toUpperCase();

    const conditions: string[] = [
      "project_id = ?",
      "user_id = ?",
      "collection = ?",
    ];
    const args: InValue[] = [
      query.projectId,
      query.userId.toString(),
      query.collection,
    ];

    if (query.installationId) {
      conditions.push("installation_id = ?");
      args.push(query.installationId);
    }
    if (query.key !== undefined && query.key !== null) {
      conditions.push("key = ?");
      args.push(query.key);
    }

    args.push(limit, offset);

    const result = await this.client.execute({
      sql: `SELECT * FROM app_data
            WHERE ${conditions.join(" AND ")}
            ORDER BY created_at ${order}
            LIMIT ? OFFSET ?`,
      args,
    });

    return result.rows.map((r) => parseRow(r as unknown as Record<string, unknown>));
  }

  async count(
    query: Pick<AppDataQuery, "projectId" | "userId" | "collection" | "installationId">,
  ): Promise<number> {
    const conditions: string[] = [
      "project_id = ?",
      "user_id = ?",
      "collection = ?",
    ];
    const args: InValue[] = [
      query.projectId,
      query.userId.toString(),
      query.collection,
    ];

    if (query.installationId) {
      conditions.push("installation_id = ?");
      args.push(query.installationId);
    }

    const result = await this.client.execute({
      sql: `SELECT COUNT(*) as cnt FROM app_data WHERE ${conditions.join(" AND ")}`,
      args,
    });

    return Number(result.rows[0].cnt);
  }

  async delete(query: AppDataDeleteQuery): Promise<number> {
    if (query.id) {
      const result = await this.client.execute({
        sql: `DELETE FROM app_data WHERE id = ? AND project_id = ? AND user_id = ?`,
        args: [query.id, query.projectId, query.userId.toString()],
      });
      return result.rowsAffected;
    }

    const conditions: string[] = [
      "project_id = ?",
      "user_id = ?",
      "collection = ?",
    ];
    const args: InValue[] = [
      query.projectId,
      query.userId.toString(),
      query.collection,
    ];

    if (query.installationId) {
      conditions.push("installation_id = ?");
      args.push(query.installationId);
    }
    if (query.key !== undefined && query.key !== null) {
      conditions.push("key = ?");
      args.push(query.key);
    }

    const result = await this.client.execute({
      sql: `DELETE FROM app_data WHERE ${conditions.join(" AND ")}`,
      args,
    });

    return result.rowsAffected;
  }

  async deleteAllByProjectId(projectId: string): Promise<number> {
    const result = await this.client.execute({
      sql: "DELETE FROM app_data WHERE project_id = ?",
      args: [projectId],
    });
    return result.rowsAffected;
  }

  async queryShared(query: SharedAppDataQuery): Promise<AppDataRow[]> {
    const limit = Math.min(query.limit ?? 50, 200);
    const offset = query.offset ?? 0;
    const order = (query.order ?? "asc").toUpperCase();

    const conditions: string[] = ["project_id = ?", "collection = ?"];
    const args: InValue[] = [query.projectId, query.collection];

    if (query.since) {
      conditions.push("created_at > ?");
      args.push(query.since);
    }

    args.push(limit, offset);

    const result = await this.client.execute({
      sql: `SELECT * FROM app_data
            WHERE ${conditions.join(" AND ")}
            ORDER BY created_at ${order}
            LIMIT ? OFFSET ?`,
      args,
    });

    return result.rows.map((r) => parseRow(r as unknown as Record<string, unknown>));
  }

  async countShared(
    query: Pick<SharedAppDataQuery, "projectId" | "collection">,
  ): Promise<number> {
    const result = await this.client.execute({
      sql: `SELECT COUNT(*) as cnt FROM app_data WHERE project_id = ? AND collection = ?`,
      args: [query.projectId, query.collection],
    });

    return Number(result.rows[0].cnt);
  }

  private async getById(id: string): Promise<AppDataRow> {
    const result = await this.client.execute({
      sql: "SELECT * FROM app_data WHERE id = ?",
      args: [id],
    });

    if (result.rows.length === 0) {
      throw new Error(`AppData row ${id} not found after write`);
    }

    return parseRow(result.rows[0] as unknown as Record<string, unknown>);
  }
}
