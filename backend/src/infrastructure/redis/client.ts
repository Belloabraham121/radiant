import { Redis } from "ioredis";
import { optional } from "../../config/optional-env.js";

let client: Redis | null | undefined;

export function getRedisClient(): Redis | null {
  if (client !== undefined) {
    return client;
  }

  const url = optional("REDIS_URL", "");
  if (!url) {
    client = null;
    return null;
  }

  const instance = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });

  instance.on("error", () => {
    // Degrade to in-memory cache when Redis is down.
  });

  client = instance;
  return client;
}

/** Test hook — replace or clear the Redis singleton. */
export function setRedisClientForTests(mock: Redis | null | undefined): void {
  if (client) {
    void client.quit().catch(() => undefined);
  }
  client = mock;
}
