import { z } from "zod";
import { chainIdSchema } from "../chains/types.js";

export type AgentMemoryFact = {
  key: string;
  value: string;
  updated_at: string;
};

export type AgentMemoryData = {
  preferences: {
    default_chain_id?: string;
  };
  facts: AgentMemoryFact[];
};

export const updateMemoryInputSchema = z
  .object({
    default_chain_id: chainIdSchema.optional(),
    facts: z
      .array(
        z.object({
          key: z.string().min(1).max(64),
          value: z.string().max(500).optional(),
          action: z.enum(["set", "remove"]).optional().default("set"),
        }),
      )
      .max(20)
      .optional(),
  })
  .superRefine((input, ctx) => {
    for (const [index, fact] of (input.facts ?? []).entries()) {
      if (fact.action === "set" && !fact.value?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "set facts require a non-empty value",
          path: ["facts", index, "value"],
        });
      }
    }
  });

export type UpdateMemoryInput = z.infer<typeof updateMemoryInputSchema>;

export type UpdateMemoryResult = {
  status: "updated";
  summary: string;
  data: AgentMemoryData;
};
