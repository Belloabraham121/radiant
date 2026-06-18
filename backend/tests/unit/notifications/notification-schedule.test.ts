import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScheduleIdempotencyKey,
  isScheduleDue,
  isValidTimezone,
  normalizeNotificationScheduleInput,
  validateScheduleSemantics,
} from "../../../src/services/notifications/notification-schedule.service.js";

describe("notification schedule service", () => {
  it("validates timezone and cron semantics", () => {
    assert.equal(isValidTimezone("UTC"), true);
    assert.equal(isValidTimezone("Not/AZone"), false);

    const ok = validateScheduleSemantics({
      kind: "cron",
      expression: "0 9 * * *",
      timezone: "America/New_York",
    });
    assert.equal(ok.ok, true);

    const badInterval = validateScheduleSemantics({
      kind: "interval",
      every_seconds: 30,
    });
    assert.equal(badInterval.ok, false);
  });

  it("normalizes once.in_seconds to a future ISO timestamp", () => {
    const now = new Date("2026-06-18T16:00:00.000Z");
    const result = normalizeNotificationScheduleInput({ kind: "once", in_seconds: 10 }, now);
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }

    assert.equal(result.schedule.kind, "once");
    assert.equal(result.schedule.at, "2026-06-18T16:00:10.000Z");

    const semantics = validateScheduleSemantics(result.schedule, {
      now,
      requireFutureOnce: true,
    });
    assert.equal(semantics.ok, true);
  });

  it("rejects once.at in the past when requireFutureOnce is set", () => {
    const now = new Date("2026-06-18T16:00:00.000Z");
    const result = validateScheduleSemantics(
      { kind: "once", at: "2026-06-18T00:00:10.000Z" },
      { now, requireFutureOnce: true },
    );
    assert.equal(result.ok, false);
  });

  it("detects due once schedules", () => {
    const now = new Date("2026-06-18T16:00:00.000Z");
    assert.equal(
      isScheduleDue(
        { kind: "once", at: "2026-06-18T15:00:00.000Z" },
        { now, lastTriggeredAt: null, createdAt: new Date("2026-06-17T00:00:00.000Z") },
      ),
      true,
    );
    assert.equal(
      isScheduleDue(
        { kind: "once", at: "2026-06-18T17:00:00.000Z" },
        { now, lastTriggeredAt: null, createdAt: new Date("2026-06-17T00:00:00.000Z") },
      ),
      false,
    );
  });

  it("detects due interval schedules from last trigger", () => {
    const now = new Date("2026-06-18T16:05:00.000Z");
    const last = new Date("2026-06-18T16:00:00.000Z");
    assert.equal(
      isScheduleDue(
        { kind: "interval", every_seconds: 300 },
        { now, lastTriggeredAt: last, createdAt: new Date("2026-06-18T15:00:00.000Z") },
      ),
      true,
    );
  });

  it("builds stable idempotency keys", () => {
    const now = new Date("2026-06-18T16:00:00.000Z");
    assert.equal(
      buildScheduleIdempotencyKey("rule-1", { kind: "once", at: now.toISOString() }, now),
      "schedule:once:rule-1",
    );
  });
});
