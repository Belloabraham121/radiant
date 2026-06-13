import { z } from "zod";

export type AgentPermissions = {
  auto_approve_enabled: boolean;
  auto_approve_max_sui: number;
};

export const updateAgentPermissionsSchema = z
  .object({
    auto_approve_enabled: z.boolean().optional(),
    auto_approve_max_sui: z.number().positive().max(1_000_000).optional(),
  })
  .refine(
    (body) => body.auto_approve_enabled !== undefined || body.auto_approve_max_sui !== undefined,
    { message: "At least one field must be provided" },
  );
