import type { ArtifactPayload } from "./project.types.js";
import type { PartialGenerateAppParse } from "./parse-partial-generate-app.js";
import { ensureAppEntry } from "./ensure-app-entry.js";

export function mergeArtifactFiles(
  base: Array<{ path: string; content: string }>,
  updates: Array<{ path: string; content: string }>,
): Array<{ path: string; content: string }> {
  const map = new Map(base.map((file) => [file.path, file]));
  for (const file of updates) {
    map.set(file.path, file);
  }
  return [...map.values()];
}

export function buildPreviewArtifactPayload(
  partial: PartialGenerateAppParse,
  existing?: ArtifactPayload | null,
): ArtifactPayload | null {
  if (!partial.files.length && !existing) {
    return null;
  }

  const mergedFiles = mergeArtifactFiles(existing?.files ?? [], partial.files);
  const withEntry = ensureAppEntry(mergedFiles);

  return {
    project_id: partial.project_id ?? existing?.project_id ?? "preview",
    name: partial.name ?? existing?.name ?? "App",
    tagline: partial.tagline ?? existing?.tagline ?? "",
    template: partial.template ?? existing?.template ?? "custom",
    revision: existing?.revision ?? -1,
    files: withEntry,
  };
}
