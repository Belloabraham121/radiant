import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getInngestConfig,
  resetInngestConfigForTests,
  useInngestDeployQueue,
} from "../../../src/config/inngest.js";

describe("inngest config", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    resetInngestConfigForTests();
  });

  it("enables Inngest in dev mode", () => {
    process.env.INNGEST_DEV = "1";
    delete process.env.INNGEST_EVENT_KEY;
    delete process.env.INNGEST_SIGNING_KEY;
    assert.equal(getInngestConfig().enabled, true);
    assert.equal(useInngestDeployQueue(), true);
  });

  it("enables Inngest when event and signing keys are set", () => {
    delete process.env.INNGEST_DEV;
    process.env.INNGEST_EVENT_KEY = "evt_test";
    process.env.INNGEST_SIGNING_KEY = "signkey_test";
    assert.equal(getInngestConfig().enabled, true);
    assert.equal(useInngestDeployQueue(), true);
  });

  it("falls back to BullMQ when auto and no Inngest config", () => {
    delete process.env.INNGEST_DEV;
    delete process.env.INNGEST_EVENT_KEY;
    delete process.env.INNGEST_SIGNING_KEY;
    process.env.DEPLOY_QUEUE_PROVIDER = "auto";
    assert.equal(getInngestConfig().enabled, false);
    assert.equal(useInngestDeployQueue(), false);
  });

  it("respects DEPLOY_QUEUE_PROVIDER=bullmq", () => {
    process.env.INNGEST_DEV = "1";
    process.env.DEPLOY_QUEUE_PROVIDER = "bullmq";
    assert.equal(useInngestDeployQueue(), false);
  });
});
