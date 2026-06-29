import { AppError } from "../../../errors/app-error.js";
import {
  emitWorkflowBuildError,
  getCanvasBuildLlmConfig,
  runWithCanvasBuildProgress,
} from "./canvas-build-progress-context.js";
import type { CanvasBuildStreamSender } from "./canvas-build-progress.types.js";
import {
  CANVAS_BUILDER_TOOL_DEFINITIONS,
  runBuilderTool,
  type BuilderGraphState,
} from "./canvas-builder-tools.js";
import { getCanvasLlmProvider } from "../llm/canvas-llm-provider.registry.js";
import type { CanvasAgentLlmConfig, CanvasLlmMessage } from "../llm/canvas-llm.types.js";
import type { CanvasGraph } from "../graph/canvas-graph.types.js";
import { loadWorkflowGraph } from "../canvas-workflow.service.js";

const BUILDER_SYSTEM_PROMPT = `You are the Radiant Canvas Builder agent. Given a natural-language workflow description, assemble a v1 workflow graph using the provided tools.

Rules:
1. Every workflow needs workflow-start (or schedule-cron) and a reachable workflow-stop or terminal action.
2. Insert workflow-approve before the first irreversible Live action unless the user pre-authorized unattended execution.
3. Prefer typed ports — connect market → Polymarket actions, trigger → action nodes, order_intent → policy-gate → action.
4. Insert policy-gate before Live action nodes; dry-run-gate when the user asks for testable flows.
5. Default prediction-market flows: workflow-start → polymarket-feed + polymarket-orderbook → threshold/if-condition → workflow-approve → polymarket-order → workflow-stop.
6. Emit workflow.node.focus by adding nodes that need config (feeds, charts, protocol actions, approve gate) — the tools handle focus automatically.
7. Call complete when the graph satisfies the user's request.

Use add_node, patch_node, add_edge, then complete. Only use v1 catalog slugs from add_node.`;

const MAX_BUILDER_TURNS = 12;

function graphSummary(graph: CanvasGraph): string {
  const nodeLines = graph.nodes.map(
    (n) => `- ${n.id}: ${n.type}${n.meta?.label ? ` (${n.meta.label})` : ""}`,
  );
  const edgeLines = graph.edges.map(
    (e) =>
      `- ${e.source.node_id}:${e.source.port} → ${e.target.node_id}:${e.target.port}`,
  );
  return [
    "Current graph:",
    "Nodes:",
    nodeLines.length ? nodeLines.join("\n") : "(none)",
    "Edges:",
    edgeLines.length ? edgeLines.join("\n") : "(none)",
  ].join("\n");
}

export type RunCanvasBuildStreamInput = {
  privyUserId: string;
  workflowId: string;
  message: string;
  send: CanvasBuildStreamSender;
  build_config?: CanvasAgentLlmConfig;
};

export async function runCanvasBuildStream(input: RunCanvasBuildStreamInput): Promise<void> {
  const buildConfig = input.build_config ?? { model_tier: "lite", provider: "openai" };

  await runWithCanvasBuildProgress({ send: input.send, build_config: buildConfig }, async () => {
    try {
      await executeBuilderTurn(input.privyUserId, input.workflowId, input.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Builder failed.";
      emitWorkflowBuildError(
        err instanceof AppError ? err.code : "BUILD_ERROR",
        message,
      );
    }
  });
}

async function executeBuilderTurn(
  privyUserId: string,
  workflowId: string,
  userMessage: string,
): Promise<void> {
  const { workflow, graph } = await loadWorkflowGraph(privyUserId, workflowId);
  const state: BuilderGraphState = {
    workflowId,
    revision: workflow.revision,
    graph: structuredClone(graph),
  };

  const llmConfig = getCanvasBuildLlmConfig();
  const providerId = llmConfig.provider ?? "openai";
  const provider = getCanvasLlmProvider(providerId);
  const model = provider.resolveModel(llmConfig.model_tier);

  const messages: CanvasLlmMessage[] = [
    { role: "system", content: BUILDER_SYSTEM_PROMPT },
    {
      role: "user",
      content: `${userMessage.trim()}\n\n${graphSummary(state.graph)}`,
    },
  ];

  let completed = false;

  for (let turn = 0; turn < MAX_BUILDER_TURNS && !completed; turn += 1) {
    const result = await provider.completeWithTools({
      model,
      messages,
      tools: CANVAS_BUILDER_TOOL_DEFINITIONS as import("../llm/canvas-llm.types.js").CanvasLlmToolDefinition[],
      max_tokens: llmConfig.model_tier === "thinking" ? 4096 : 2048,
      temperature: 0.2,
    });

    if (result.content.trim()) {
      messages.push({ role: "assistant", content: result.content });
    }

    if (result.tool_calls.length === 0) {
      if (turn === MAX_BUILDER_TURNS - 1) {
        throw new AppError(422, "BUILD_INCOMPLETE", "Builder did not finish the workflow.");
      }
      messages.push({
        role: "user",
        content: "Continue building the workflow using tools, then call complete.",
      });
      continue;
    }

    for (const toolCall of result.tool_calls) {
      let parsedArgs: unknown;
      try {
        parsedArgs = JSON.parse(toolCall.arguments || "{}");
      } catch {
        throw new AppError(400, "INVALID_TOOL_ARGS", `Invalid JSON for ${toolCall.name}`);
      }

      const toolResult = await runBuilderTool(toolCall.name, parsedArgs, state);
      messages.push({
        role: "assistant",
        content: `[tool:${toolCall.name}] ${toolResult.message}`,
      });

      if (toolResult.completed) {
        completed = true;
      }
    }
  }

  if (!completed) {
    throw new AppError(422, "BUILD_INCOMPLETE", "Builder reached turn limit without completing.");
  }
}

/** Deterministic builder for tests — adds start → price-chart → stop without LLM. */
export async function runCanvasBuildStreamStub(
  privyUserId: string,
  workflowId: string,
  send: CanvasBuildStreamSender,
  build_config?: CanvasAgentLlmConfig,
): Promise<void> {
  await runWithCanvasBuildProgress({ send, build_config }, async () => {
    const { workflow, graph } = await loadWorkflowGraph(privyUserId, workflowId);
    const state: BuilderGraphState = {
      workflowId,
      revision: workflow.revision,
      graph: structuredClone(graph),
    };

    await runBuilderTool(
      "add_node",
      { slug: "workflow-start", position: { x: 40, y: 200 } },
      state,
    );
    await runBuilderTool(
      "add_node",
      { slug: "if-condition", position: { x: 360, y: 200 } },
      state,
    );
    if (state.graph.nodes.length >= 2) {
      await runBuilderTool(
        "add_edge",
        {
          source_node_id: state.graph.nodes[0]!.id,
          source_port: "trigger",
          target_node_id: state.graph.nodes[1]!.id,
          target_port: "trigger",
        },
        state,
      );
    }
    await runBuilderTool(
      "add_node",
      { slug: "workflow-stop", position: { x: 720, y: 200 } },
      state,
    );
    await runBuilderTool(
      "complete",
      { summary: "Stub builder assembled a sample BTC chart workflow." },
      state,
    );
  });
}
