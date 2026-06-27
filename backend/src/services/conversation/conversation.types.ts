import { z } from "zod";

export const createSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export type SessionListItem = {
  id: string;
  title: string;
  updated_at: string;
  preview: string | null;
  has_active_transaction: boolean;
};

export type SessionDetail = {
  id: string;
  title: string;
  updated_at: string;
};

export type MessageRecord = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls: unknown;
  app_scope?: unknown;
  created_at: string;
};
