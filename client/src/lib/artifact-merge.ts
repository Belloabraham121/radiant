import type { ArtifactFile, ArtifactPayload } from "@/lib/artifact-types";
import { normalizeArtifactFileContent } from "@/lib/artifact-file-content";

function normalizeFile(file: ArtifactFile): ArtifactFile {
  return {
    ...file,
    content: normalizeArtifactFileContent(file.content),
  };
}

export function mergeArtifactFiles(
  base: ArtifactFile[],
  updates: ArtifactFile[],
): ArtifactFile[] {
  const map = new Map(base.map((file) => [file.path, file]));
  for (const file of updates) {
    map.set(file.path, normalizeFile(file));
  }
  return [...map.values()].map(normalizeFile);
}

export function normalizeArtifactPayload(payload: ArtifactPayload): ArtifactPayload {
  return {
    ...payload,
    files: payload.files.map(normalizeFile),
  };
}

export function mergeArtifactPayload(
  existing: ArtifactPayload | null,
  incoming: ArtifactPayload,
): ArtifactPayload {
  const normalizedIncoming = normalizeArtifactPayload(incoming);

  if (!existing) {
    return normalizedIncoming;
  }

  if (
    normalizedIncoming.project_id !== "preview" &&
    existing.project_id !== "preview" &&
    normalizedIncoming.project_id !== existing.project_id
  ) {
    return normalizedIncoming;
  }

  const mergedFiles = mergeArtifactFiles(existing.files, normalizedIncoming.files);

  return {
    project_id:
      normalizedIncoming.project_id !== "preview"
        ? normalizedIncoming.project_id
        : existing.project_id,
    name: normalizedIncoming.name ?? existing.name,
    tagline: normalizedIncoming.tagline ?? existing.tagline,
    template: normalizedIncoming.template ?? existing.template,
    revision:
      normalizedIncoming.revision >= 0
        ? normalizedIncoming.revision
        : existing.revision >= 0
          ? existing.revision
          : normalizedIncoming.revision,
    files: mergedFiles,
  };
}
