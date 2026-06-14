import type { Request } from "express";
import { z } from "zod";

export const RADIANT_SESSION_ID_HEADER = "x-radiant-session-id";

const sessionIdSchema = z.string().uuid();

/** Optional chat session correlation from preview / UI action requests. */
export function readAppActionSessionId(req: Request): string | undefined {
  const raw = req.headers[RADIANT_SESSION_ID_HEADER];
  if (typeof raw !== "string" || !raw.trim()) {
    return undefined;
  }
  const parsed = sessionIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
