import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import { prisma } from "../../infrastructure/postgres/client.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import type { CanvasGraph } from "./graph/canvas-graph.types.js";
import { parseCanvasGraph } from "./graph/validate-graph.js";
import type { CanvasAgentLlmConfig } from "./llm/canvas-llm.types.js";
import { canvasAgentLlmConfigSchema } from "./llm/canvas-llm.schema.js";
import { createDefaultCanvasPolicy } from "./policy/canvas-policy.schema.js";
import type {
  CanvasWorkflowDetail,
  CanvasWorkflowListItem,
  CreateCanvasWorkflowInput,
  PatchCanvasBuildConfigInput,
  PatchCanvasTesterConfigInput,
  UpdateCanvasWorkflowInput,
} from "./canvas-workflow.types.js";
import { validateCanvasGraph } from "./graph/validate-graph.js";

const DEFAULT_BUILD_CONFIG: CanvasAgentLlmConfig = {
  model_tier: "lite",
  provider: "openai",
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

function parseBuildConfig(raw: unknown): CanvasAgentLlmConfig | null {
  if (raw == null) return null;
  return canvasAgentLlmConfigSchema.parse(raw);
}

function toWorkflowDetail(
  row: Awaited<ReturnType<typeof requireOwnedWorkflow>>,
): CanvasWorkflowDetail {
  const graph = parseCanvasGraph(row.graph);
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    schema_version: row.schema_version,
    revision: row.revision,
    graph,
    build_config: parseBuildConfig(row.build_config),
    tester_config: parseBuildConfig(row.tester_config),
    policy_id: row.policy_id,
    design_notes: row.design_notes,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function toListItem(
  row: Awaited<ReturnType<typeof prisma.canvasWorkflow.findMany>>[number],
): CanvasWorkflowListItem {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    revision: row.revision,
    updated_at: row.updated_at.toISOString(),
  };
}

export async function listUserWorkflows(
  privyUserId: string,
): Promise<{ workflows: CanvasWorkflowListItem[] }> {
  const userId = await requireUserId(privyUserId);
  const rows = await prisma.canvasWorkflow.findMany({
    where: { user_id: userId },
    orderBy: { updated_at: "desc" },
  });
  return { workflows: rows.map(toListItem) };
}

export async function createUserWorkflow(
  privyUserId: string,
  input: CreateCanvasWorkflowInput = {},
): Promise<CanvasWorkflowDetail> {
  const userId = await requireUserId(privyUserId);
  const workflowId = randomUUID();
  const policyId = randomUUID();
  const defaultPolicy = createDefaultCanvasPolicy(workflowId);
  const emptyGraph: CanvasGraph = { nodes: [], edges: [] };

  await prisma.$transaction(async (tx) => {
    await tx.canvasWorkflowPolicy.create({
      data: {
        id: policyId,
        workflow_id: workflowId,
        policy: defaultPolicy as Prisma.InputJsonValue,
      },
    });
    await tx.canvasWorkflow.create({
      data: {
        id: workflowId,
        user_id: userId,
        name: input.name ?? "Untitled workflow",
        policy_id: policyId,
        graph: emptyGraph as Prisma.InputJsonValue,
        build_config: DEFAULT_BUILD_CONFIG as Prisma.InputJsonValue,
        tester_config: DEFAULT_BUILD_CONFIG as Prisma.InputJsonValue,
        revision: 0,
      },
    });
    await tx.canvasWorkflowRevision.create({
      data: {
        workflow_id: workflowId,
        revision: 0,
        graph: emptyGraph as Prisma.InputJsonValue,
        build_config: DEFAULT_BUILD_CONFIG as Prisma.InputJsonValue,
        tester_config: DEFAULT_BUILD_CONFIG as Prisma.InputJsonValue,
      },
    });
  });

  const created = await requireOwnedWorkflow(workflowId, userId);
  return toWorkflowDetail(created);
}

export async function getUserWorkflow(
  privyUserId: string,
  workflowId: string,
): Promise<CanvasWorkflowDetail> {
  const userId = await requireUserId(privyUserId);
  const workflow = await requireOwnedWorkflow(workflowId, userId);
  return toWorkflowDetail(workflow);
}

export async function updateUserWorkflow(
  privyUserId: string,
  workflowId: string,
  input: UpdateCanvasWorkflowInput,
): Promise<CanvasWorkflowDetail> {
  const userId = await requireUserId(privyUserId);
  await requireOwnedWorkflow(workflowId, userId);

  if (input.graph) {
    const validation = validateCanvasGraph(input.graph);
    if (!validation.ok) {
      throw new AppError(400, "GRAPH_VALIDATION_ERROR", "Invalid workflow graph.", {
        errors: validation.errors,
      });
    }
  }

  const updated = await prisma.canvasWorkflow.update({
    where: { id: workflowId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.graph !== undefined
        ? { graph: input.graph as Prisma.InputJsonValue }
        : {}),
    },
  });

  if (input.graph) {
    await persistWorkflowRevision(workflowId, updated.revision + 1, input.graph, {
      build_config: parseBuildConfig(updated.build_config),
      tester_config: parseBuildConfig(updated.tester_config),
    });
    const refreshed = await requireOwnedWorkflow(workflowId, userId);
    return toWorkflowDetail(refreshed);
  }

  return toWorkflowDetail(updated);
}

export async function patchUserWorkflowBuildConfig(
  privyUserId: string,
  workflowId: string,
  input: PatchCanvasBuildConfigInput,
): Promise<CanvasWorkflowDetail> {
  const userId = await requireUserId(privyUserId);
  await requireOwnedWorkflow(workflowId, userId);

  const updated = await prisma.canvasWorkflow.update({
    where: { id: workflowId },
    data: {
      build_config: input as Prisma.InputJsonValue,
    },
  });

  return toWorkflowDetail(updated);
}

export async function patchUserWorkflowTesterConfig(
  privyUserId: string,
  workflowId: string,
  input: PatchCanvasTesterConfigInput,
): Promise<CanvasWorkflowDetail> {
  const userId = await requireUserId(privyUserId);
  await requireOwnedWorkflow(workflowId, userId);

  const updated = await prisma.canvasWorkflow.update({
    where: { id: workflowId },
    data: {
      tester_config: input as Prisma.InputJsonValue,
    },
  });

  return toWorkflowDetail(updated);
}

export type PersistRevisionOptions = {
  build_config?: CanvasAgentLlmConfig | null;
  tester_config?: CanvasAgentLlmConfig | null;
};

/** Bump revision and store immutable graph snapshot. */
export async function persistWorkflowRevision(
  workflowId: string,
  nextRevision: number,
  graph: CanvasGraph,
  options: PersistRevisionOptions = {},
): Promise<number> {
  const validation = validateCanvasGraph(graph);
  if (!validation.ok) {
    throw new AppError(400, "GRAPH_VALIDATION_ERROR", "Invalid workflow graph.", {
      errors: validation.errors,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.canvasWorkflow.update({
      where: { id: workflowId },
      data: {
        graph: graph as Prisma.InputJsonValue,
        revision: nextRevision,
        ...(options.build_config !== undefined
          ? { build_config: options.build_config as Prisma.InputJsonValue }
          : {}),
        ...(options.tester_config !== undefined
          ? { tester_config: options.tester_config as Prisma.InputJsonValue }
          : {}),
      },
    });
    await tx.canvasWorkflowRevision.create({
      data: {
        workflow_id: workflowId,
        revision: nextRevision,
        graph: graph as Prisma.InputJsonValue,
        build_config:
          options.build_config === undefined
            ? undefined
            : (options.build_config as Prisma.InputJsonValue),
        tester_config:
          options.tester_config === undefined
            ? undefined
            : (options.tester_config as Prisma.InputJsonValue),
      },
    });
  });

  return nextRevision;
}

export async function loadWorkflowGraph(
  privyUserId: string,
  workflowId: string,
): Promise<{ workflow: CanvasWorkflowDetail; graph: CanvasGraph }> {
  const detail = await getUserWorkflow(privyUserId, workflowId);
  return { workflow: detail, graph: detail.graph };
}

/** Persist graph after a coherent builder patch (increments revision). */
export async function persistCoherentGraphPatch(
  workflowId: string,
  currentRevision: number,
  graph: CanvasGraph,
): Promise<number> {
  return persistWorkflowRevision(workflowId, currentRevision + 1, graph);
}

export async function markWorkflowDryRunReady(workflowId: string): Promise<void> {
  await prisma.canvasWorkflow.update({
    where: { id: workflowId },
    data: { status: "dry_run_ready" },
  });
}
