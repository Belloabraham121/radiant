import { z } from "zod";

export const waitlistBodySchema = z.object({
  email: z.string().email().max(320),
  source: z.string().max(100).optional(),
});

export type WaitlistBody = z.infer<typeof waitlistBodySchema>;

export type WaitlistSignupResult = {
  email: string;
  created: boolean;
};
