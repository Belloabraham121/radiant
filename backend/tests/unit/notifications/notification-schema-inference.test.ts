import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inferProjectNotificationSchemaForArtifact,
  parseNotificationManifestFromArtifact,
  shouldPersistNotificationSchema,
  usesNotificationSdk,
} from "../../../src/services/notifications/notification-schema-inference.service.js";
import { NOTIFICATION_MANIFEST_EXAMPLE_TS } from "../../../src/services/projects/notification-app-reference.template.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

describe("notification schema inference", () => {
  it("detects notification SDK usage", () => {
    assert.equal(usesNotificationSdk("await createNotificationRule({"), true);
    assert.equal(usesNotificationSdk("import { swapQuote } from '../lib/radiant-client'"), false);
  });

  it("parses lib/radiant-notifications.ts manifest for any app", () => {
    const types = parseNotificationManifestFromArtifact([
      { path: "lib/radiant-notifications.ts", content: NOTIFICATION_MANIFEST_EXAMPLE_TS },
    ]);
    assert.equal(types.length, 2);
    assert.equal(types[0]?.type, "item_outbid");
    assert.equal(types[0]?.trigger_kind, "event");
    assert.equal(types[1]?.type, "daily_reminder");
    assert.equal(types[1]?.trigger_kind, "schedule");
  });

  it("persists schema from manifest (not domain heuristics)", () => {
    const schema = inferProjectNotificationSchemaForArtifact(PROJECT_ID, {
      files: [{ path: "lib/radiant-notifications.ts", content: NOTIFICATION_MANIFEST_EXAMPLE_TS }],
    });
    assert.ok(schema);
    assert.equal(schema!.app_id, PROJECT_ID);
    assert.equal(schema!.types[0]?.type, "item_outbid");
    assert.equal(schema!.types[0]?.condition_schema[0]?.name, "item_id");
  });

  it("does not infer schema from unrelated page copy", () => {
    const schema = inferProjectNotificationSchemaForArtifact(PROJECT_ID, {
      files: [
        {
          path: "app/page.tsx",
          content: "export default function Page() { return <h1>Flash loan arb dashboard</h1>; }",
        },
      ],
    });
    assert.equal(schema, null);
  });

  it("falls back to generic stubs from createNotificationRule literals", () => {
    const schema = inferProjectNotificationSchemaForArtifact(PROJECT_ID, {
      files: [
        {
          path: "components/Alerts.tsx",
          content:
            'await createNotificationRule({ notification_type: "bid_placed", condition: { item_id: "1" } });',
        },
      ],
    });
    assert.ok(schema);
    assert.equal(schema!.types[0]?.type, "bid_placed");
    assert.equal(schema!.types[0]?.trigger_kind, "event");
  });

  it("shouldPersist when manifest or SDK is present", () => {
    assert.equal(
      shouldPersistNotificationSchema({
        files: [{ path: "x.tsx", content: "listNotificationRules()" }],
      }),
      true,
    );
    assert.equal(
      shouldPersistNotificationSchema({
        files: [{ path: "lib/radiant-notifications.ts", content: NOTIFICATION_MANIFEST_EXAMPLE_TS }],
      }),
      true,
    );
  });
});
