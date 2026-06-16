import { parsePartialGenerateAppArgs } from "./parse-partial-generate-app.js";
import { normalizeArtifactFileContent } from "./artifact-file-content.js";

type ArtifactFileInput = { path: string; content: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function normalizeFileEntry(value: unknown): ArtifactFileInput | null {
  if (!isRecord(value)) return null;
  const path = coerceString(value.path);
  const content =
    typeof value.content === "string"
      ? normalizeArtifactFileContent(value.content)
      : undefined;
  if (!path || content === undefined) return null;
  return { path, content };
}

/** Turn common LLM mistakes (single file object, keyed map, JSON string) into a files array. */
export function coerceGenerateAppFiles(value: unknown): ArtifactFileInput[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      return coerceGenerateAppFiles(JSON.parse(trimmed) as unknown);
    } catch {
      return [];
    }
  }

  if (Array.isArray(value)) {
    return value.map(normalizeFileEntry).filter((file): file is ArtifactFileInput => file !== null);
  }

  if (!isRecord(value)) {
    return [];
  }

  const asSingle = normalizeFileEntry(value);
  if (asSingle) {
    return [asSingle];
  }

  const fromValues = Object.values(value)
    .map(normalizeFileEntry)
    .filter((file): file is ArtifactFileInput => file !== null);
  if (fromValues.length > 0) {
    return fromValues;
  }

  return [];
}

/**
 * Best-effort normalization before Zod validation — fixes common generate_app tool shapes
 * and recovers fields from partial/truncated JSON tool arguments.
 */
export function normalizeGenerateAppInput(
  input: Record<string, unknown>,
  rawArguments = "",
): Record<string, unknown> {
  const partial = rawArguments.trim() ? parsePartialGenerateAppArgs(rawArguments) : null;

  const name =
    coerceString(input.name) ??
    coerceString(input.title) ??
    coerceString(input.project_name) ??
    partial?.name;

  const tagline = coerceString(input.tagline) ?? partial?.tagline;

  let files = coerceGenerateAppFiles(input.files);
  if (files.length === 0 && partial?.files.length) {
    files = partial.files;
  }

  const projectIdRaw = input.project_id;
  const project_id =
    projectIdRaw === null
      ? null
      : (coerceString(projectIdRaw) ?? partial?.project_id ?? undefined);

  const templateRaw = coerceString(input.template) ?? partial?.template;
  const template =
    templateRaw === "custom" ||
    templateRaw === "escrow" ||
    templateRaw === "swap" ||
    templateRaw === "prediction" ||
    templateRaw === "margin"
      ? templateRaw
      : undefined;

  const resolvedName = name ?? (files.length > 0 ? "App" : undefined);

  return {
    ...(resolvedName ? { name: resolvedName } : {}),
    ...(tagline ? { tagline } : {}),
    ...(files.length > 0 ? { files } : {}),
    ...(project_id !== undefined ? { project_id } : {}),
    ...(template ? { template } : {}),
  };
}
