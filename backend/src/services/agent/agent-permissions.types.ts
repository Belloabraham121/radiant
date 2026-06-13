import { z } from "zod";

export type AgentPermissions = {
  auto_approve_enabled: boolean;
  auto_approve_max_sui: number;
  allow_flash_loans: boolean;
  auto_approve_flash_loans: boolean;
  allow_governance: boolean;
};

export const updateAgentPermissionsSchema = z
  .object({
    auto_approve_enabled: z.boolean().optional(),
    auto_approve_max_sui: z.number().positive().max(1_000_000).optional(),
    allow_flash_loans: z.boolean().optional(),
    auto_approve_flash_loans: z.boolean().optional(),
    allow_governance: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.auto_approve_enabled !== undefined ||
      body.auto_approve_max_sui !== undefined ||
      body.allow_flash_loans !== undefined ||
      body.auto_approve_flash_loans !== undefined ||
      body.allow_governance !== undefined,
    { message: "At least one field must be provided" },
  );
