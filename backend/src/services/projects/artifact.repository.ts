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

export type ArtifactRevisionSummary = {
  revision: number;
  file_count: number;
  created_at: string;
};

export async function listArtifactRevisions(projectId: string): Promise<ArtifactRevisionSummary[]> {
  const grouped = await prisma.artifactFile.groupBy({
    by: ["revision"],
    where: { project_id: projectId },
    _count: { path: true },
    _min: { created_at: true },
    orderBy: { revision: "asc" },
  });

  return grouped.map((row) => ({
    revision: row.revision,
    file_count: row._count.path,
    created_at: row._min.created_at?.toISOString() ?? new Date(0).toISOString(),
  }));
}

export async function artifactRevisionExists(
  projectId: string,
  revision: number,
): Promise<boolean> {
  const file = await prisma.artifactFile.findFirst({
    where: { project_id: projectId, revision },
    select: { id: true },
  });
  return file != null;
}
