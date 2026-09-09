import type { WaitlistEmail } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";

export async function findWaitlistEmailByEmail(
  email: string,
): Promise<WaitlistEmail | null> {
  return prisma.waitlistEmail.findUnique({ where: { email } });
}

export async function createWaitlistEmail(data: {
  email: string;
  source?: string | null;
}): Promise<WaitlistEmail> {
  return prisma.waitlistEmail.create({
    data: {
      email: data.email,
      source: data.source ?? null,
    },
  });
}
