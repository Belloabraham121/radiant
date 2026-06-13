import type { ArtifactFile } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";

export type ArtifactFileInput = { path: string; content: string };

export async function upsertArtifactFiles(
  projectId: string,
  revision: number,
  files: ArtifactFileInput[],
): Promise<ArtifactFile[]> {
  return prisma.$transaction(
    files.map((file) =>
      prisma.artifactFile.upsert({
        where: {
          project_id_path_revision: {
            project_id: projectId,
            path: file.path,
            revision,
          },
        },
        create: {
          project_id: projectId,
          path: file.path,
          content: file.content,
          revision,
        },
        update: {
          content: file.content,
        },
      }),
    ),
  );
}

export async function listArtifactFiles(
  projectId: string,
  revision: number,
): Promise<ArtifactFile[]> {
  return prisma.artifactFile.findMany({
    where: {
      project_id: projectId,
      revision,
    },
    orderBy: { path: "asc" },
  });
}
