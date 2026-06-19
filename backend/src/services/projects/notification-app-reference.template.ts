/** Generic schema-driven alert panel — works for any app notification types. */

export const NOTIFICATION_APP_REFERENCE_VERSION = 2;

export type NotificationReferenceFile = { path: string; content: string };

export const NOTIFICATION_ALERTS_PANEL_TSX = `"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createNotificationRule,
  deleteNotificationRule,
  getNotificationSchema,
  listNotificationRules,
  type NotificationRuleRecord,
  type NotificationTypeDefinition,
} from "../lib/radiant-client";

type ConditionDraft = Record<string, string>;

function emptyDraft(type: NotificationTypeDefinition): ConditionDraft {
  const draft: ConditionDraft = {};
  for (const field of type.condition_schema ?? []) {
    draft[field.name] = "";
  }
  return draft;
}

function parseCondition(type: NotificationTypeDefinition, draft: ConditionDraft) {
  const condition: Record<string, unknown> = {};
  for (const field of type.condition_schema ?? []) {
    const raw = draft[field.name]?.trim();
    if (!raw) {
      if (field.required) {
        throw new Error("Missing required field: " + field.name);
      }
      continue;
    }
    if (field.type === "number") {
      condition[field.name] = Number(raw);
    } else if (field.type === "boolean") {
      condition[field.name] = raw === "true";
    } else {
      condition[field.name] = raw;
    }
  }
  return condition;
}

export default function NotificationAlertsPanel() {
  const [types, setTypes] = useState<NotificationTypeDefinition[]>([]);
  const [rules, setRules] = useState<NotificationRuleRecord[]>([]);
  const [selectedType, setSelectedType] = useState<string>("");
  const [draft, setDraft] = useState<ConditionDraft>({});
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const activeType = useMemo(
    () => types.find((entry) => entry.type === selectedType) ?? null,
    [types, selectedType],
  );

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const schemaResult = await getNotificationSchema();
      const catalog = schemaResult.schema?.types ?? [];
      setTypes(catalog);
      if (!selectedType && catalog[0]) {
        setSelectedType(catalog[0].type);
        setDraft(emptyDraft(catalog[0]));
      }
      const ruleResult = await listNotificationRules({ status: "active" });
      setRules(ruleResult.rules);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (activeType) {
      setDraft(emptyDraft(activeType));
    }
  }, [activeType?.type]);

  async function handleCreate() {
    if (!activeType) {
      return;
    }
    setError(null);
    try {
      const condition = parseCondition(activeType, draft);
      await createNotificationRule({
        notification_type: activeType.type,
        label: label.trim() || activeType.label,
        condition,
        channels: activeType.default_channels ?? ["in_app", "web_push"],
      });
      setLabel("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create alert");
    }
  }

  async function handleDelete(ruleId: string) {
    await deleteNotificationRule(ruleId);
    await refresh();
  }

  if (loading) {
    return <p>Loading alerts…</p>;
  }

  if (types.length === 0) {
    return (
      <section style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <h2 style={{ marginTop: 0 }}>Alerts</h2>
        <p style={{ margin: 0, opacity: 0.8 }}>
          No alert types declared yet. Add lib/radiant-notifications.ts to this app.
        </p>
      </section>
    );
  }

  return (
    <section style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
      <h2 style={{ marginTop: 0 }}>Alerts</h2>
      <label style={{ display: "block", marginBottom: 8 }}>
        Alert type
        <select
          data-radiant-id="alert-type"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          style={{ display: "block", width: "100%", marginTop: 4 }}
        >
          {types.map((entry) => (
            <option key={entry.type} value={entry.type}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
      {activeType?.description ? (
        <p style={{ margin: "0 0 12px", opacity: 0.8 }}>{activeType.description}</p>
      ) : null}
      <label style={{ display: "block", marginBottom: 8 }}>
        Label (optional)
        <input
          data-radiant-id="alert-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={activeType?.label}
          style={{ display: "block", width: "100%", marginTop: 4 }}
        />
      </label>
      {(activeType?.condition_schema ?? []).map((field) => (
        <label key={field.name} style={{ display: "block", marginBottom: 8 }}>
          {field.name}
          {field.required ? " *" : ""}
          <input
            data-radiant-id={"alert-" + field.name}
            type={field.type === "number" ? "number" : "text"}
            value={draft[field.name] ?? ""}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, [field.name]: e.target.value }))
            }
            style={{ display: "block", width: "100%", marginTop: 4 }}
          />
        </label>
      ))}
      <button data-radiant-id="alert-create" type="button" onClick={() => void handleCreate()}>
        Create alert
      </button>
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
      <ul style={{ marginTop: 16, paddingLeft: 20 }}>
        {rules.map((rule) => (
          <li key={rule.id} style={{ marginBottom: 8 }}>
            {rule.label ?? rule.notification_type}{" "}
            <button type="button" onClick={() => void handleDelete(rule.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
`;

export const NOTIFICATION_MANIFEST_EXAMPLE_TS = `/** Alert types for this app — parsed by Radiant (like lib/radiant-actions.ts). Template v${NOTIFICATION_APP_REFERENCE_VERSION}. */
export const notifications = [
  {
    type: "item_outbid",
    label: "Outbid on auction",
    description: "Notify when someone bids higher on an item you are watching",
    trigger_kind: "event",
    default_channels: ["in_app", "web_push"],
    condition_schema: [
      { name: "item_id", type: "string", required: true },
      { name: "max_bid_usd", type: "number" },
    ],
  },
  {
    type: "daily_reminder",
    label: "Daily reminder",
    description: "Remind me at a set time each day",
    trigger_kind: "schedule",
    default_channels: ["in_app"],
    condition_schema: [],
  },
];
`;

export const NOTIFICATION_REFERENCE_FILES: NotificationReferenceFile[] = [
  { path: "components/NotificationAlertsPanel.tsx", content: NOTIFICATION_ALERTS_PANEL_TSX },
];

function normalizeClientPath(path: string): string {
  return path.replace(/^\/+/, "").replace(/^\/workspace\//, "");
}

function hasPath(files: NotificationReferenceFile[], target: string): boolean {
  return files.some((file) => normalizeClientPath(file.path) === target);
}

function hasCustomAlertUi(source: string): boolean {
  return /NotificationAlertsPanel|AlertPanel|AlertsPanel|alert settings/i.test(source);
}

/** Inject generic alert panel when app uses notification SDK or declares lib/radiant-notifications.ts. */
export function mergeNotificationReferenceFiles<T extends { path: string; content: string }>(
  files: T[],
): T[] {
  const source = files.map((file) => file.content).join("\n");
  const usesSdk =
    /\b(createNotificationRule|listNotificationRules|getNotificationSchema)\s*\(/.test(source) ||
    files.some((file) => normalizeManifestPath(file.path) === "lib/radiant-notifications.ts");

  if (
    !usesSdk ||
    hasPath(files, "components/NotificationAlertsPanel.tsx") ||
    hasCustomAlertUi(source)
  ) {
    return files;
  }

  return [
    ...files,
    {
      path: "components/NotificationAlertsPanel.tsx",
      content: NOTIFICATION_ALERTS_PANEL_TSX,
    } as T,
  ];
}
