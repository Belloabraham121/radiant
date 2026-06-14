import type { ArtifactFile, ArtifactPayload } from "@/lib/artifact-types";

export function mergeArtifactFiles(
  base: ArtifactFile[],
  updates: ArtifactFile[],
): ArtifactFile[] {
  const map = new Map(base.map((file) => [file.path, file]));
  for (const file of updates) {
    map.set(file.path, file);
  }
  return [...map.values()];
}

export function mergeArtifactPayload(
  existing: ArtifactPayload | null,
  incoming: ArtifactPayload,
): ArtifactPayload {
  if (!existing) {
    return incoming;
  }

  if (
    incoming.project_id !== "preview" &&
    existing.project_id !== "preview" &&
    incoming.project_id !== existing.project_id
  ) {
    return incoming;
  }

  const mergedFiles = mergeArtifactFiles(existing.files, incoming.files);

  return {
    project_id:
      incoming.project_id !== "preview" ? incoming.project_id : existing.project_id,
    name: incoming.name ?? existing.name,
    tagline: incoming.tagline ?? existing.tagline,
    template: incoming.template ?? existing.template,
    revision:
      incoming.revision >= 0
        ? incoming.revision
        : existing.revision >= 0
          ? existing.revision
          : incoming.revision,
    files: mergedFiles,
  };
}
