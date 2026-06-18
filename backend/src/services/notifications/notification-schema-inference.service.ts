import type { ArtifactFileInput } from "../projects/artifact.repository.js";
import {
  parseStoredProjectNotificationSchema,
  projectNotificationSchemaSchema,
} from "./notification-schema.service.js";
import {
  PROJECT_NOTIFICATION_SCHEMA_VERSION,
  type NotificationChannel,
  type NotificationTypeDefinition,
  type ProjectNotificationSchema,
} from "./notification-schema.types.js";

const NOTIFICATION_MANIFEST_PATHS = new Set([
  "lib/radiant-notifications.ts",
  "lib/radiant-notifications.js",
]);

const NOTIFICATION_SDK_FN_PATTERN =
  /\b(createNotificationRule|listNotificationRules|deleteNotificationRule|getNotificationSchema|listNotifications|markNotificationRead)\s*\(/;

const NOTIFICATION_TYPE_LITERAL_PATTERN =
  /notification_type:\s*["']([a-z][a-z0-9_.]*)["']/g;

const MANIFEST_TYPE_PATTERN = /type:\s*["']([a-z_][a-z0-9_]*)["']/g;

function concatUserArtifactSource(files: ArtifactFileInput[]): string {
  return files
    .filter((file) => !file.path.includes("node_modules"))
    .map((file) => file.content)
    .join("\n");
}

function normalizeManifestPath(path: string): string {
  return path.replace(/^\/+/, "").replace(/^\/workspace\//, "");
}

function findNotificationManifestFile(files: ArtifactFileInput[]): ArtifactFileInput | null {
  return (
    files.find((file) => NOTIFICATION_MANIFEST_PATHS.has(normalizeManifestPath(file.path))) ??
    null
  );
}

function readQuotedField(block: string, field: string): string | null {
  const match = block.match(new RegExp(`${field}:\\s*["']([^"']+)["']`));
  return match?.[1] ?? null;
}

function readNumberField(block: string, field: string): number | undefined {
  const match = block.match(new RegExp(`${field}:\\s*(\\d+)`));
  return match ? Number(match[1]) : undefined;
}

function parseConditionSchema(block: string): NotificationTypeDefinition["condition_schema"] {
  const schemaMatch = block.match(/condition_schema:\s*\[([\s\S]*?)\]/);
  if (!schemaMatch) {
    return [];
  }

  const fields: NotificationTypeDefinition["condition_schema"] = [];
  for (const fieldBlock of schemaMatch[1]!.matchAll(/\{[^}]+\}/g)) {
    const name = readQuotedField(fieldBlock[0], "name");
    const type = readQuotedField(fieldBlock[0], "type") as
      | NotificationTypeDefinition["condition_schema"][number]["type"]
      | null;
    if (!name || !type) {
      continue;
    }
    const required = /required:\s*true/.test(fieldBlock[0]);
    const description = readQuotedField(fieldBlock[0], "description");
    fields.push({
      name,
      type,
      ...(required ? { required: true } : {}),
      ...(description ? { description } : {}),
    });
  }
  return fields;
}

function parseDefaultChannels(block: string): NotificationChannel[] {
  const match = block.match(/default_channels:\s*\[([^\]]+)\]/);
  if (!match) {
    return ["in_app"];
  }
  const channels = [...match[1]!.matchAll(/["'](in_app|web_push|email)["']/g)].map(
    (entry) => entry[1] as NotificationChannel,
  );
  return channels.length > 0 ? channels : ["in_app"];
}

function parseTriggerKind(
  block: string,
): NotificationTypeDefinition["trigger_kind"] {
  const match = block.match(/trigger_kind:\s*["'](event|poll|schedule)["']/);
  return (match?.[1] as NotificationTypeDefinition["trigger_kind"]) ?? "event";
}

function splitManifestTypeBlocks(content: string): string[] {
  const exportIndex = content.indexOf("notifications");
  const slice = exportIndex >= 0 ? content.slice(exportIndex) : content;
  const arrayStart = slice.indexOf("[");
  if (arrayStart < 0) {
    return [];
  }

  const blocks: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of slice.slice(arrayStart + 1)) {
    if (char === "{") {
      depth += 1;
    }
    if (depth > 0) {
      current += char;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0 && current.trim()) {
        blocks.push(current);
        current = "";
      }
    }
    if (depth === 0 && char === "]") {
      break;
    }
  }
  return blocks;
}

/** Parse `lib/radiant-notifications.ts` — same pattern as lib/radiant-actions.ts for actions. */
export function parseNotificationManifestFromArtifact(
  files: ArtifactFileInput[],
): NotificationTypeDefinition[] {
  const manifest = findNotificationManifestFile(files);
  if (!manifest) {
    return [];
  }

  const types: NotificationTypeDefinition[] = [];
  const seen = new Set<string>();

  for (const block of splitManifestTypeBlocks(manifest.content)) {
    const typeMatch = block.match(/type:\s*["']([a-z_][a-z0-9_]*)["']/);
    if (!typeMatch || seen.has(typeMatch[1]!)) {
      continue;
    }
    seen.add(typeMatch[1]!);

    const label = readQuotedField(block, "label") ?? typeMatch[1]!;
    const description = readQuotedField(block, "description") ?? `Alert: ${label}`;
    const evaluator = readQuotedField(block, "evaluator") ?? undefined;
    const pollInterval = readNumberField(block, "poll_interval_seconds");

    types.push({
      type: typeMatch[1]!,
      label,
      description,
      trigger_kind: parseTriggerKind(block),
      condition_schema: parseConditionSchema(block),
      default_channels: parseDefaultChannels(block),
      ...(pollInterval !== undefined ? { poll_interval_seconds: pollInterval } : {}),
      ...(evaluator ? { evaluator } : {}),
    });
  }

  return types;
}

function slugFromNotificationTypeLiteral(value: string): string {
  const dotIndex = value.indexOf(".");
  return dotIndex > 0 ? value.slice(dotIndex + 1) : value;
}

/** Fallback: infer minimal type stubs from createNotificationRule() calls in app code. */
function schemaFromNotificationTypeLiterals(
  projectId: string,
  source: string,
): ProjectNotificationSchema | null {
  const slugs = new Set<string>();
  for (const match of source.matchAll(NOTIFICATION_TYPE_LITERAL_PATTERN)) {
    slugs.add(slugFromNotificationTypeLiteral(match[1]!));
  }

  if (slugs.size === 0) {
    return null;
  }

  return {
    schema_version: PROJECT_NOTIFICATION_SCHEMA_VERSION,
    app_id: projectId,
    types: [...slugs].map((type) => ({
      type,
      label: type.replace(/_/g, " "),
      description: `User-defined alert: ${type}`,
      trigger_kind: "event" as const,
      condition_schema: [],
      default_channels: ["in_app"] as NotificationChannel[],
    })),
  };
}

export function usesNotificationSdk(source: string): boolean {
  return NOTIFICATION_SDK_FN_PATTERN.test(source);
}

export function hasNotificationManifest(files: ArtifactFileInput[]): boolean {
  return findNotificationManifestFile(files) != null;
}

export function shouldPersistNotificationSchema(input: {
  files: ArtifactFileInput[];
}): boolean {
  const source = concatUserArtifactSource(input.files);
  return (
    hasNotificationManifest(input.files) ||
    usesNotificationSdk(source) ||
    MANIFEST_TYPE_PATTERN.test(source)
  );
}

/** Build notification_schema to persist on generate_app / edit_app (parallel to action_schema). */
export function inferProjectNotificationSchemaForArtifact(
  projectId: string,
  input: { files: ArtifactFileInput[] },
): ProjectNotificationSchema | null {
  if (!shouldPersistNotificationSchema(input)) {
    return null;
  }

  const manifestTypes = parseNotificationManifestFromArtifact(input.files);
  if (manifestTypes.length > 0) {
    const schema: ProjectNotificationSchema = {
      schema_version: PROJECT_NOTIFICATION_SCHEMA_VERSION,
      app_id: projectId,
      types: manifestTypes,
    };
    const parsed = projectNotificationSchemaSchema.safeParse(schema);
    return parsed.success ? parsed.data : null;
  }

  const source = concatUserArtifactSource(input.files);
  const schema = schemaFromNotificationTypeLiterals(projectId, source);
  if (!schema) {
    return null;
  }

  const parsed = projectNotificationSchemaSchema.safeParse(schema);
  return parsed.success ? parsed.data : null;
}

export function resolveStoredProjectNotificationSchemaFromProject(project: {
  id: string;
  notification_schema?: unknown | null;
}): ProjectNotificationSchema | null {
  const stored = parseStoredProjectNotificationSchema(project.notification_schema);
  if (!stored) {
    return null;
  }

  if (stored.app_id !== project.id) {
    return { ...stored, app_id: project.id };
  }

  return stored;
}
