/**
 * One-time migration: copies all AppData rows from Postgres → Turso.
 *
 * Usage:
 *   1. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env
 *   2. Run: npx tsx scripts/migrate-appdata-to-turso.ts
 *   3. After verifying, flip APP_DATA_STORAGE=turso in .env
 *   4. Optionally drop the AppData table from Postgres after running in production for a while
 */
import "dotenv/config";
import { createClient } from "@libsql/client";
import { prisma } from "../src/infrastructure/postgres/client.js";
import { logger } from "../src/shared/logger.js";

const BATCH_SIZE = 500;

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
];

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    logger.error("TURSO_DATABASE_URL is required. Set it in .env and try again.");
    process.exit(1);
  }

  const turso = createClient({ url, authToken: authToken || undefined });

  // Ensure table + indexes exist
  await turso.execute(CREATE_TABLE_SQL);
  for (const sql of CREATE_INDEXES_SQL) {
    await turso.execute(sql);
  }
  logger.info("Turso schema ready");

  // Connect to Postgres
  await prisma.$connect();
  const totalRows = await prisma.appData.count();
  logger.info(`Found ${totalRows} AppData rows in Postgres`);

  if (totalRows === 0) {
    logger.info("Nothing to migrate");
    await prisma.$disconnect();
    turso.close();
    return;
  }

  let migrated = 0;
  let offset = 0;

  while (offset < totalRows) {
    const batch = await prisma.appData.findMany({
      orderBy: { created_at: "asc" },
      take: BATCH_SIZE,
      skip: offset,
    });

    if (batch.length === 0) break;

    const transaction = batch.map((row) => ({
      sql: `INSERT OR REPLACE INTO app_data
            (id, project_id, installation_id, user_id, collection, key, data, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        row.id,
        row.project_id,
        row.installation_id,
        row.user_id.toString(),
        row.collection,
        row.key,
        JSON.stringify(row.data),
        row.created_at.toISOString(),
        row.updated_at.toISOString(),
      ] as Array<string | null>,
    }));

    await turso.batch(transaction, "write");
    migrated += batch.length;
    offset += BATCH_SIZE;

    logger.info(`Migrated ${migrated}/${totalRows} rows`);
  }

  logger.info(`Migration complete: ${migrated} rows copied to Turso`);

  // Verify counts match
  const tursoCount = await turso.execute("SELECT COUNT(*) as cnt FROM app_data");
  const tursoTotal = Number(tursoCount.rows[0].cnt);
  logger.info(`Verification — Postgres: ${totalRows}, Turso: ${tursoTotal}`);

  if (tursoTotal >= totalRows) {
    logger.info(
      "All rows migrated. Next steps:\n" +
      "  1. Set APP_DATA_STORAGE=turso in .env\n" +
      "  2. Restart the server\n" +
      "  3. Test that app data reads/writes work\n" +
      "  4. Once confident, remove the AppData model from prisma/schema.prisma and run a migration",
    );
  } else {
    logger.warn(
      `Row count mismatch — some rows may not have migrated. ` +
      `Re-run the script (it uses INSERT OR REPLACE, so duplicates are safe).`,
    );
  }

  await prisma.$disconnect();
  turso.close();
}

main().catch((err) => {
  logger.error("Migration failed", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
