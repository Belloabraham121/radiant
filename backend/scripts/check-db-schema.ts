import "dotenv/config";
import { prisma } from "../src/infrastructure/postgres/client.js";
import { logger } from "../src/shared/logger.js";

async function main() {
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
  logger.info("Database connection OK");
  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error("Database check failed", {
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
