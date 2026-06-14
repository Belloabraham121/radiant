import type { ChatSessionDraft, ChatSessionDraftFile } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client.js";
import type { ArtifactFileInput } from "./artifact.repository.js";

export async function findSessionDraftBySessionId(
  sessionId: string,
): Promise<ChatSessionDraft | null> {
  return prisma.chatSessionDraft.findUnique({
    where: { session_id: sessionId },
  });
}

export async function upsertSessionDraftFiles(
  draftId: string,
  revision: number,
  files: ArtifactFileInput[],
): Promise<ChatSessionDraftFile[]> {
  return prisma.$transaction(
    files.map((file) =>
      prisma.chatSessionDraftFile.upsert({
        where: {
          draft_id_path_revision: {
            draft_id: draftId,
            path: file.path,
            revision,
          },
        },
        create: {
          draft_id: draftId,
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

export async function listSessionDraftFiles(
  draftId: string,
  revision: number,
): Promise<ChatSessionDraftFile[]> {
  return prisma.chatSessionDraftFile.findMany({
    where: { draft_id: draftId, revision },
    orderBy: { path: "asc" },
  });
}

export async function createSessionDraft(data: {
  sessionId: string;
  name: string;
  tagline?: string;
  template: string;
}): Promise<ChatSessionDraft> {
  return prisma.chatSessionDraft.create({
    data: {
      session_id: data.sessionId,
      name: data.name,
      tagline: data.tagline ?? "",
      template: data.template,
      revision: 0,
    },
  });
}

export async function bumpSessionDraftRevision(draftId: string): Promise<ChatSessionDraft> {
  return prisma.chatSessionDraft.update({
    where: { id: draftId },
    data: { revision: { increment: 1 } },
  });
}

export async function updateSessionDraftMeta(
  draftId: string,
  data: { name?: string; tagline?: string; template?: string },
): Promise<ChatSessionDraft> {
  return prisma.chatSessionDraft.update({
    where: { id: draftId },
    data,
  });
}

export async function deleteSessionDraft(sessionId: string): Promise<void> {
  await prisma.chatSessionDraft.deleteMany({
    where: { session_id: sessionId },
  });
}
