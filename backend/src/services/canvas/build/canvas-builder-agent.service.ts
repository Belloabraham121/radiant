import { AppError } from "../../../errors/app-error.js";
import {
  emitWorkflowBuildAck,
  emitWorkflowBuildError,
  emitWorkflowBuildStarted,
  emitWorkflowBuildStatus,
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
import {
  buildBuilderSystemPrompt,
  formatPortHintForSlug,
  validateBuilderGraphConnectivity,
} from "./builder-port-catalog.js";

const MAX_BUILDER_TURNS = 16;

const CHITCHAT_PATTERN =
  /^(hi|hello|hey|thanks|thank you|ok|okay|test|help|yo|sup|howdy)[!.?\s]*$/i;

function isLikelyWorkflowRequest(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length < 12 && CHITCHAT_PATTERN.test(trimmed)) {
    return false;
  }
  return true;
}

function toolActionLabel(toolName: string, args: unknown): string {
  if (toolName === "add_node" && args && typeof args === "object" && "slug" in args) {
    const slug = String((args as { slug: string }).slug);
    return `Adding ${slug} node…`;
  }
  if (toolName === "add_edge") return "Connecting nodes…";
  if (toolName === "patch_node") return "Updating node config…";
  if (toolName === "search_polymarket_markets") return "Searching Polymarket markets…";
  if (toolName === "complete") return "Finalizing workflow…";
  return `Running ${toolName}…`;
}

function truncateThinking(text: string, max = 280): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

function graphSummary(graph: CanvasGraph): string {
  const nodeLines = graph.nodes.map((n) => {
    const slug = n.type.replace(/_/g, "-");
    const label = n.meta?.label ? ` label="${n.meta.label}"` : "";
    return `- id=${n.id} slug=${slug}${label}`;
  });
  const edgeLines = graph.edges.map(
    (e) =>
      `- ${e.source.node_id}:${e.source.port} → ${e.target.node_id}:${e.target.port}`,
  );
  return [
    "Current graph (use exact ids in add_edge):",
    "Nodes:",
    nodeLines.length ? nodeLines.join("\n") : "(none)",
    "Edges:",
    edgeLines.length ? edgeLines.join("\n") : "(none — you MUST add edges before complete)",
  ].join("\n");
}

function connectivityReminder(state: BuilderGraphState): string {
  const issues = validateBuilderGraphConnectivity(state.graph);
  if (issues.length === 0) {
    return "";
  }
  return [
    "Connectivity issues — fix with add_edge before calling complete:",
    ...issues.map((i) => `- ${i}`),
    graphSummary(state.graph),
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
  emitWorkflowBuildStarted("Builder agent started");

  if (!isLikelyWorkflowRequest(userMessage)) {
    emitWorkflowBuildStatus(
      "Hi! I'm the Radiant Canvas Builder — I assemble workflow graphs from plain-English descriptions.",
      "status",
    );
    emitWorkflowBuildStatus(
      'Try something like: "When BTC drops 5%, alert me and buy the top Polymarket market."',
      "status",
    );
    emitWorkflowBuildAck("Waiting for your workflow description.");
    return;
  }

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
    { role: "system", content: buildBuilderSystemPrompt() },
    {
      role: "user",
      content: `${userMessage.trim()}\n\n${graphSummary(state.graph)}`,
    },
  ];

  let completed = false;

  emitWorkflowBuildStatus("Reading your request and planning the workflow…", "thinking");

  for (let turn = 0; turn < MAX_BUILDER_TURNS && !completed; turn += 1) {
    if (turn > 0) {
      emitWorkflowBuildStatus(`Continuing build (step ${turn + 1})…`, "thinking");
    }

    const result = await provider.completeWithTools({
      model,
      messages,
      tools: CANVAS_BUILDER_TOOL_DEFINITIONS as import("../llm/canvas-llm.types.js").CanvasLlmToolDefinition[],
      max_tokens: llmConfig.model_tier === "thinking" ? 4096 : 2048,
      temperature: 0.2,
    });

    if (result.content.trim()) {
      emitWorkflowBuildStatus(truncateThinking(result.content), "thinking");
      messages.push({ role: "assistant", content: result.content });
    }

    if (result.tool_calls.length === 0) {
      if (turn === MAX_BUILDER_TURNS - 1) {
        throw new AppError(422, "BUILD_INCOMPLETE", "Builder did not finish the workflow.");
      }
      emitWorkflowBuildStatus("No tool calls yet — prompting the agent to continue…", "status");
      messages.push({
        role: "user",
        content:
          "Continue building: use add_node, then add_edge to wire each step (use node UUIDs from add_node responses), then complete.",
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

      if (toolCall.name === "complete") {
        const connectivityIssues = validateBuilderGraphConnectivity(state.graph);
        if (connectivityIssues.length > 0) {
          const feedback = connectivityReminder(state);
          emitWorkflowBuildStatus(
            "Build incomplete — nodes must be connected with add_edge before finishing.",
            "status",
          );
          messages.push({
            role: "assistant",
            content: `[tool:complete rejected] ${connectivityIssues.join(" ")}`,
          });
          messages.push({
            role: "user",
            content: `${feedback}\n\nCall add_edge for each missing link, then complete again.`,
          });
          continue;
        }
      }

      emitWorkflowBuildStatus(
        toolActionLabel(toolCall.name, parsedArgs),
        "tool",
        toolCall.name,
      );

      const toolResult = await runBuilderTool(toolCall.name, parsedArgs, state);
      emitWorkflowBuildStatus(toolResult.message, "success", toolCall.name);
      messages.push({
        role: "assistant",
        content: `[tool:${toolCall.name}] ${toolResult.message}`,
      });

      if (toolResult.completed) {
        completed = true;
      }
    }

    if (!completed) {
      const hadAddNode = result.tool_calls.some((tc) => tc.name === "add_node");
      const hadAddEdge = result.tool_calls.some((tc) => tc.name === "add_edge");
      if (hadAddNode && !hadAddEdge && state.graph.nodes.length >= 2) {
        messages.push({
          role: "user",
          content: `You added nodes but did not call add_edge. Wire the workflow now using exact node ids and compatible ports.\n\n${connectivityReminder(state) || graphSummary(state.graph)}`,
        });
      } else {
        const reminder = connectivityReminder(state);
        if (reminder) {
          messages.push({
            role: "user",
            content: reminder,
          });
        }
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
    emitWorkflowBuildStarted("Stub builder started");
    emitWorkflowBuildStatus("Assembling sample workflow (stub mode)…", "status");
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
    if (state.graph.nodes.length >= 3) {
      const stopId = state.graph.nodes[state.graph.nodes.length - 1]!.id;
      const ifId = state.graph.nodes[1]!.id;
      await runBuilderTool(
        "add_edge",
        {
          source_node_id: ifId,
          source_port: "trigger",
          target_node_id: stopId,
          target_port: "trigger",
        },
        state,
      );
    }
    await runBuilderTool(
      "complete",
      { summary: "Stub builder assembled a sample BTC chart workflow." },
      state,
    );
  });
}
