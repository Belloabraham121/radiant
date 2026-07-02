import { AppError } from "../../errors/app-error.js";
import { prisma } from "../../infrastructure/postgres/client.js";
import { findUserByPrivyId } from "../auth/user.repository.js";

export type CanvasWorkflowRunListItem = {
  id: string;
  workflow_id: string;
  mode: "dry" | "live";
  status: string;
  workflow_revision: number;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
};

export type CanvasWorkflowRunEventItem = {
  id: string;
  event_type: string;
  payload: unknown;
  created_at: string;
};

export type CanvasWorkflowRunDetail = CanvasWorkflowRunListItem & {
  events: CanvasWorkflowRunEventItem[];
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

function toListItem(
  row: Awaited<ReturnType<typeof prisma.canvasWorkflowRun.findMany>>[number],
): CanvasWorkflowRunListItem {
  return {
    id: row.id,
    workflow_id: row.workflow_id,
    mode: row.mode,
    status: row.status,
    workflow_revision: row.workflow_revision,
    started_at: row.started_at.toISOString(),
    finished_at: row.finished_at?.toISOString() ?? null,
    error_message: row.error_message,
  };
}

export async function listWorkflowRuns(
  privyUserId: string,
  workflowId: string,
): Promise<{ runs: CanvasWorkflowRunListItem[] }> {
  const userId = await requireUserId(privyUserId);
  await requireOwnedWorkflow(workflowId, userId);

  const rows = await prisma.canvasWorkflowRun.findMany({
    where: { workflow_id: workflowId, user_id: userId },
    orderBy: { started_at: "desc" },
    take: 50,
  });

  return { runs: rows.map(toListItem) };
}

export async function getWorkflowRun(
  privyUserId: string,
  workflowId: string,
  runId: string,
): Promise<CanvasWorkflowRunDetail> {
  const userId = await requireUserId(privyUserId);
  await requireOwnedWorkflow(workflowId, userId);

  const run = await prisma.canvasWorkflowRun.findFirst({
    where: { id: runId, workflow_id: workflowId, user_id: userId },
    include: {
      events: { orderBy: { created_at: "asc" } },
    },
  });

  if (!run) {
    throw new AppError(404, "RUN_NOT_FOUND", "Workflow run not found.");
  }

  return {
    ...toListItem(run),
    events: run.events.map((e) => ({
      id: e.id,
      event_type: e.event_type,
      payload: e.payload,
      created_at: e.created_at.toISOString(),
    })),
  };
}
