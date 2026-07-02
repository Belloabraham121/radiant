import type { CanvasBuildMessage, CanvasBuildMessageRole } from "@prisma/client";
import { AppError } from "../../../errors/app-error.js";
import { prisma } from "../../../infrastructure/postgres/client.js";
import { findUserByPrivyId } from "../../auth/user.repository.js";
import type { CanvasLlmMessage } from "../llm/canvas-llm.types.js";

export const CANVAS_BUILD_MEMORY_MAX_MESSAGES = 20;
export const CANVAS_BUILD_MEMORY_MAX_CHARS = 8000;

export type CanvasBuildMessageItem = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type BuildContextMessage = {
  role: CanvasBuildMessageRole;
  content: string;
};

async function requireUserId(privyUserId: string): Promise<bigint> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User profile not found.");
  }
  return user.id;
}

async function requireOwnedWorkflow(workflowId: string, userId: bigint) {
  const workflow = await prisma.canvasWorkflow.findFirst({
    where: { id: workflowId, user_id: userId },
  });
  if (!workflow) {
    throw new AppError(404, "WORKFLOW_NOT_FOUND", "Canvas workflow not found.");
  }
  return workflow;
}

function toMessageItem(row: CanvasBuildMessage): CanvasBuildMessageItem {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    created_at: row.created_at.toISOString(),
  };
}

/** Cap user/assistant pairs for Builder LLM context (oldest dropped first). */
export function buildBuildContextMessages(
  messages: BuildContextMessage[],
  options?: { maxMessages?: number; maxChars?: number },
): Array<{ role: "user" | "assistant"; content: string }> {
  const maxMessages = options?.maxMessages ?? CANVAS_BUILD_MEMORY_MAX_MESSAGES;
  const maxChars = options?.maxChars ?? CANVAS_BUILD_MEMORY_MAX_CHARS;

  let selected = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-maxMessages);

  while (selected.length > 0) {
    const totalChars = selected.reduce((sum, message) => sum + message.content.length, 0);
    if (totalChars <= maxChars) break;
    selected = selected.slice(1);
  }

  return selected.map((message) => ({
    role: message.role as "user" | "assistant",
    content: message.content,
  }));
}

export function assembleBuilderTurnMessages(
  systemPrompt: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  currentUserContent: string,
): CanvasLlmMessage[] {
  return [
    { role: "system", content: systemPrompt },
    ...history.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    { role: "user", content: currentUserContent },
  ];
}

export async function loadBuildMessages(
  privyUserId: string,
  workflowId: string,
  limit?: number,
): Promise<{ messages: CanvasBuildMessageItem[] }> {
  const userId = await requireUserId(privyUserId);
  await requireOwnedWorkflow(workflowId, userId);

  const take = limit ?? CANVAS_BUILD_MEMORY_MAX_MESSAGES;
  const rows = await prisma.canvasBuildMessage.findMany({
    where: { workflow_id: workflowId, user_id: userId },
    orderBy: { created_at: "asc" },
    take,
  });

  return { messages: rows.map(toMessageItem) };
}

/** Recent thread for agent context (newest-first query, returned ascending). */
export async function loadRecentBuildContext(
  privyUserId: string,
  workflowId: string,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const userId = await requireUserId(privyUserId);
  await requireOwnedWorkflow(workflowId, userId);

  const recent = await prisma.canvasBuildMessage.findMany({
    where: { workflow_id: workflowId, user_id: userId },
    orderBy: { created_at: "desc" },
    take: CANVAS_BUILD_MEMORY_MAX_MESSAGES,
  });

  return buildBuildContextMessages(recent.reverse());
}

export async function appendBuildMessage(
  privyUserId: string,
  workflowId: string,
  role: CanvasBuildMessageRole,
  content: string,
): Promise<CanvasBuildMessageItem> {
  const userId = await requireUserId(privyUserId);
  await requireOwnedWorkflow(workflowId, userId);

  const row = await prisma.canvasBuildMessage.create({
    data: {
      workflow_id: workflowId,
      user_id: userId,
      role,
      content,
    },
  });

  return toMessageItem(row);
}

export async function clearBuildMessages(
  privyUserId: string,
  workflowId: string,
): Promise<{ cleared: number }> {
  const userId = await requireUserId(privyUserId);
  await requireOwnedWorkflow(workflowId, userId);

  const result = await prisma.canvasBuildMessage.deleteMany({
    where: { workflow_id: workflowId, user_id: userId },
  });

  return { cleared: result.count };
}

export async function updateWorkflowDesignNotes(
  privyUserId: string,
  workflowId: string,
  designNotes: string,
): Promise<void> {
  const userId = await requireUserId(privyUserId);
  await requireOwnedWorkflow(workflowId, userId);

  await prisma.canvasWorkflow.update({
    where: { id: workflowId },
    data: { design_notes: designNotes },
  });
}
