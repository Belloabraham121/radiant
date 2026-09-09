import { Prisma } from "@prisma/client";
import { normalizeEmail } from "../../utils/normalize-email.js";
import {
  createWaitlistEmail,
  findWaitlistEmailByEmail,
} from "./waitlist.repository.js";
import type { WaitlistBody, WaitlistSignupResult } from "./waitlist.types.js";

export async function signupWaitlistEmail(
  body: WaitlistBody,
): Promise<WaitlistSignupResult> {
  const email = normalizeEmail(body.email);
  const source = body.source?.trim() || null;

  const existing = await findWaitlistEmailByEmail(email);
  if (existing) {
    return { email, created: false };
  }

  try {
    await createWaitlistEmail({ email, source });
    return { email, created: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { email, created: false };
    }
    throw error;
  }
}
