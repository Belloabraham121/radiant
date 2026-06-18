import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RADIANT_CLIENT_API_CATEGORIES,
  formatExternalApiAndNotificationsWorkflowForPrompt,
  formatRadiantClientApiGuideForPrompt,
  formatRadiantClientApiReminderForToolResult,
} from "../../../src/services/projects/radiant-client-api-catalog.js";

describe("radiant-client-api-catalog", () => {
  it("covers major integration categories", () => {
    const ids = RADIANT_CLIENT_API_CATEGORIES.map((c) => c.id);
    assert.ok(ids.includes("market_data"));
    assert.ok(ids.includes("defi_execute"));
    assert.ok(ids.includes("wallet"));
    assert.ok(ids.includes("external"));
    assert.ok(ids.includes("notifications_external"));
    assert.ok(ids.includes("notifications"));
  });

  it("prompt guide mentions fetchExternalJson and deepbookOhlcv", () => {
    const guide = formatRadiantClientApiGuideForPrompt();
    assert.match(guide, /fetchExternalJson/);
    assert.match(guide, /deepbookOhlcv/);
    assert.match(guide, /never invent API names/i);
  });

  it("tool result reminder lists platform exports", () => {
    const reminder = formatRadiantClientApiReminderForToolResult();
    assert.match(reminder, /flashLoanQuote/);
    assert.match(reminder, /fetchExternalJson/);
    assert.match(reminder, /createNotificationRule/);
    assert.match(reminder, /snake_case/);
  });

  it("external API workflow mentions auth headers and notifications", () => {
    const guide = formatExternalApiAndNotificationsWorkflowForPrompt();
    assert.match(guide, /call_api/);
    assert.match(guide, /fetchExternalJson/);
    assert.match(guide, /Authorization/);
    assert.match(guide, /radiant-notifications/);
    assert.match(guide, /NotificationAlertsPanel/);
  });
});
