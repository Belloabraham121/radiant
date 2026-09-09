import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../../src/infrastructure/postgres/client.js";
import { signupWaitlistEmail } from "../../../src/services/waitlist/waitlist.service.js";

describe("signupWaitlistEmail", () => {
  const email = "Waitlist.Unit@Radiant.DEV";
  const normalized = "waitlist.unit@radiant.dev";

  before(async () => {
    await prisma.waitlistEmail.deleteMany({ where: { email: normalized } });
  });

  after(async () => {
    await prisma.waitlistEmail.deleteMany({ where: { email: normalized } });
    await prisma.$disconnect();
  });

  it("normalizes email and creates once", async () => {
    const first = await signupWaitlistEmail({ email, source: "test" });
    assert.deepEqual(first, { email: normalized, created: true });

    const second = await signupWaitlistEmail({ email: normalized, source: "test" });
    assert.deepEqual(second, { email: normalized, created: false });
  });
});
