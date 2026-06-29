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
  type BuilderToolResult,
} from "./canvas-builder-tools.js";
import { getCanvasLlmProvider } from "../llm/canvas-llm-provider.registry.js";
import type { CanvasAgentLlmConfig, CanvasLlmMessage } from "../llm/canvas-llm.types.js";
import type { CanvasGraph } from "../graph/canvas-graph.types.js";
import { loadWorkflowGraph, persistCoherentGraphPatch } from "../canvas-workflow.service.js";
import {
  buildBuilderSystemPrompt,
  formatPortHintForSlug,
  validateBuilderGraphConnectivity,
  validateBuilderNodeConfig,
} from "./builder-port-catalog.js";
import { formatEditScopeHint, sanitizeGraphNodeConfigs } from "./builder-config-catalog.js";
import { validateCanvasGraph } from "../graph/validate-graph.js";

const MAX_BUILDER_TURNS = 40;

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

function truncateConfigValue(value: unknown, maxLen = 80): unknown {
  if (typeof value === "string") {
    return value.length > maxLen ? `${value.slice(0, maxLen - 1)}…` : value;
  }
  if (Array.isArray(value)) {
    return value.length > 6 ? `[${value.length} items]` : value;
  }
  if (typeof value === "object" && value !== null) {
    return "[object]";
  }
  return value;
}

function formatNodeConfigSummary(config: Record<string, unknown>): string {
  const keys = Object.keys(config);
  if (keys.length === 0) return "{}";
  const compact: Record<string, unknown> = {};
  for (const key of keys.slice(0, 14)) {
    compact[key] = truncateConfigValue(config[key]);
  }
  if (keys.length > 14) {
    compact["…"] = `${keys.length - 14} more keys`;
  }
  return JSON.stringify(compact);
}

function graphSummary(graph: CanvasGraph): string {
  const nodeLines = graph.nodes.map((n) => {
    const slug = n.type.replace(/_/g, "-");
    const label = n.meta?.label ? ` label="${n.meta.label}"` : "";
    const config = formatNodeConfigSummary(n.config ?? {});
    return `- id=${n.id} slug=${slug}${label} config=${config}`;
  });
  const edgeLines = graph.edges.map(
    (e) =>
      `- ${e.source.node_id}:${e.source.port} → ${e.target.node_id}:${e.target.port}`,
  );
  return [
    "Current graph (use exact ids in add_edge and patch_node):",
    "Nodes:",
    nodeLines.length ? nodeLines.join("\n") : "(none)",
    "Edges:",
    edgeLines.length ? edgeLines.join("\n") : "(none — you MUST add edges before complete)",
  ].join("\n");
}

function looksLikeEditRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /\b(change|update|set|modify|adjust|edit|make the|make it|switch)\b/.test(lower) ||
    /\$\d+/.test(message) ||
    /\b(threshold|order size|size to|buy|sell)\b/.test(lower)
  );
}

function inferEditIntent(
  graph: CanvasGraph,
  message: string,
  selectedNodeId?: string,
  explicit?: "create" | "patch",
): "create" | "patch" | undefined {
  if (explicit) return explicit;
  if (selectedNodeId) return "patch";
  if (graph.nodes.length === 0) return "create";
  if (looksLikeEditRequest(message)) return "patch";
  return undefined;
}

function buildUserMessageContent(
  userMessage: string,
  graph: CanvasGraph,
  options: {
    selectedNodeId?: string;
    editIntent?: "create" | "patch";
  },
): string {
  const parts: string[] = [userMessage.trim()];
  const editIntent = inferEditIntent(graph, userMessage, options.selectedNodeId, options.editIntent);

  if (options.selectedNodeId) {
    const selected = graph.nodes.find((n) => n.id === options.selectedNodeId);
    const slug = selected ? selected.type.replace(/_/g, "-") : "unknown";
    parts.push(
      `User selected node id=${options.selectedNodeId} (${slug}) — prefer patch_node on this node only unless they ask for structural changes.`,
    );
  }

  if (editIntent === "patch" && graph.nodes.length > 0) {
    const scopeHint = formatEditScopeHint(userMessage);
    parts.push(
      "EDIT MODE: The workflow graph already exists. Use patch_node only on matching nodes by id or slug — do NOT add duplicate nodes. Do NOT call search_polymarket_markets unless the user changes the market or the feed node lacks asset_id. Call complete immediately after patching the nodes the user asked to change — do not re-patch nodes that already have valid config.",
    );
    if (scopeHint) {
      parts.push(scopeHint);
    }
  }

  parts.push(graphSummary(graph));
  return parts.join("\n\n");
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

function configReminder(state: BuilderGraphState): string {
  const issues = validateBuilderNodeConfig(state.graph);
  if (issues.length === 0) {
    return "";
  }
  return [
    "Config issues — patch_node (or add_node.config) before calling complete:",
    ...issues.map((i) => `- ${i}`),
    graphSummary(state.graph),
  ].join("\n");
}

function buildValidationReminder(state: BuilderGraphState): string {
  const connectivity = connectivityReminder(state);
  const config = configReminder(state);
  return [connectivity, config].filter(Boolean).join("\n\n");
}

function graphIsValid(state: BuilderGraphState): boolean {
  return (
    validateBuilderGraphConnectivity(state.graph).length === 0 &&
    validateBuilderNodeConfig(state.graph).length === 0
  );
}

function extractPatchNodeId(args: unknown): string | undefined {
  if (!args || typeof args !== "object" || !("node_id" in args)) return undefined;
  const nodeId = (args as { node_id: unknown }).node_id;
  return typeof nodeId === "string" ? nodeId : undefined;
}

export type RunCanvasBuildStreamInput = {
  privyUserId: string;
  workflowId: string;
  message: string;
  send: CanvasBuildStreamSender;
  build_config?: CanvasAgentLlmConfig;
  selected_node_id?: string;
  edit_intent?: "create" | "patch";
};

export async function runCanvasBuildStream(input: RunCanvasBuildStreamInput): Promise<void> {
  const buildConfig = input.build_config ?? { model_tier: "lite", provider: "openai" };

  await runWithCanvasBuildProgress({ send: input.send, build_config: buildConfig }, async () => {
    try {
      await executeBuilderTurn(input.privyUserId, input.workflowId, input.message, {
        selectedNodeId: input.selected_node_id,
        editIntent: input.edit_intent,
      });
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
  buildOptions: {
    selectedNodeId?: string;
    editIntent?: "create" | "patch";
  } = {},
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
  const { graph: sanitizedGraph, changed: configsSanitized } = sanitizeGraphNodeConfigs(
    structuredClone(graph),
  );
  let revision = workflow.revision;
  let workingGraph = sanitizedGraph;
  if (configsSanitized && validateCanvasGraph(sanitizedGraph).ok) {
    revision = await persistCoherentGraphPatch(workflowId, workflow.revision, sanitizedGraph);
    workingGraph = sanitizedGraph;
  }

  const state: BuilderGraphState = {
    workflowId,
    revision,
    graph: workingGraph,
  };

  const llmConfig = getCanvasBuildLlmConfig();
  const providerId = llmConfig.provider ?? "openai";
  const provider = getCanvasLlmProvider(providerId);
  const model = provider.resolveModel(llmConfig.model_tier);

  const messages: CanvasLlmMessage[] = [
    { role: "system", content: buildBuilderSystemPrompt() },
    {
      role: "user",
      content: buildUserMessageContent(userMessage, state.graph, {
        selectedNodeId: buildOptions.selectedNodeId,
        editIntent: buildOptions.editIntent,
      }),
    },
  ];

  let completed = false;
  const resolvedEditIntent = inferEditIntent(
    state.graph,
    userMessage,
    buildOptions.selectedNodeId,
    buildOptions.editIntent,
  );
  const patchCountByNode = new Map<string, number>();
  let consecutivePatchOnlyTurns = 0;

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
          "Continue building: use add_node, patch_node for config, add_edge to wire each step (use node UUIDs from add_node responses), then complete.",
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
        const configIssues = validateBuilderNodeConfig(state.graph);
        if (connectivityIssues.length > 0 || configIssues.length > 0) {
          const allIssues = [...connectivityIssues, ...configIssues];
          const feedback = buildValidationReminder(state);
          emitWorkflowBuildStatus(
            connectivityIssues.length > 0
              ? "Build incomplete — nodes must be connected with add_edge before finishing."
              : "Build incomplete — node config must be filled before finishing.",
            "status",
          );
          messages.push({
            role: "assistant",
            content: `[tool:complete rejected] ${allIssues.join(" ")}`,
          });
          messages.push({
            role: "user",
            content: `${feedback}\n\nFix connectivity with add_edge and config with patch_node, then complete again.`,
          });
          continue;
        }
      }

      emitWorkflowBuildStatus(
        toolActionLabel(toolCall.name, parsedArgs),
        "tool",
        toolCall.name,
      );

      let toolResult: BuilderToolResult;
      try {
        toolResult = await runBuilderTool(toolCall.name, parsedArgs, state);
      } catch (err) {
        if (err instanceof AppError && toolCall.name === "add_edge" && err.code === "INCOMPATIBLE_PORTS") {
          emitWorkflowBuildStatus(err.message, "status");
          messages.push({
            role: "assistant",
            content: `[tool:add_edge failed] ${err.message}`,
          });
          messages.push({
            role: "user",
            content: `Fix the port pair and call add_edge again with compatible source_port/target_port. See NEVER signal → data rules in your instructions.\n\n${graphSummary(state.graph)}`,
          });
          continue;
        }
        if (err instanceof AppError && toolCall.name === "patch_node" && err.code === "GRAPH_VALIDATION_ERROR") {
          const detail =
            err.details && typeof err.details === "object" && "errors" in err.details
              ? JSON.stringify((err.details as { errors: unknown }).errors)
              : err.message;
          emitWorkflowBuildStatus(`Patch rejected: ${detail}`, "status");
          messages.push({
            role: "assistant",
            content: `[tool:patch_node failed] ${detail}`,
          });
          messages.push({
            role: "user",
            content: `Fix the patch config (use numeric size/value, valid enums) and retry patch_node. Use patch: { config: { ... } }.\n\n${graphSummary(state.graph)}`,
          });
          continue;
        }
        if (err instanceof AppError && toolCall.name === "add_node" && err.code === "GRAPH_VALIDATION_ERROR") {
          const detail =
            err.details && typeof err.details === "object" && "errors" in err.details
              ? JSON.stringify((err.details as { errors: unknown }).errors)
              : err.message;
          emitWorkflowBuildStatus(`Add node rejected: ${detail}`, "status");
          messages.push({
            role: "assistant",
            content: `[tool:add_node failed] ${detail}`,
          });
          messages.push({
            role: "user",
            content: `Graph validation failed — fix stale node configs with patch_node (numeric max_rows/value/size, valid enums) or retry add_node. Errors: ${detail}\n\n${graphSummary(state.graph)}`,
          });
          continue;
        }
        throw err;
      }

      if (toolCall.name === "patch_node") {
        const nodeId = extractPatchNodeId(parsedArgs);
        if (nodeId) {
          patchCountByNode.set(nodeId, (patchCountByNode.get(nodeId) ?? 0) + 1);
        }
        if (resolvedEditIntent === "patch" && graphIsValid(state)) {
          toolResult = {
            ...toolResult,
            message: `${toolResult.message} Graph validates — call complete with a summary of your edits.`,
          };
        }
      }

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
      const toolNames = result.tool_calls.map((tc) => tc.name);
      const patchOnlyTurn =
        toolNames.length > 0 && toolNames.every((name) => name === "patch_node");
      if (patchOnlyTurn) {
        consecutivePatchOnlyTurns += 1;
      } else if (!toolNames.includes("complete")) {
        consecutivePatchOnlyTurns = 0;
      }

      const duplicatePatchNode = [...patchCountByNode.entries()].find(([, count]) => count >= 2);
      if (duplicatePatchNode) {
        const [nodeId, count] = duplicatePatchNode;
        messages.push({
          role: "user",
          content: `Stop patching node ${nodeId} — you already patched it ${count} times without progress. Call complete now with a summary of changes.`,
        });
      } else if (consecutivePatchOnlyTurns >= 3) {
        messages.push({
          role: "user",
          content:
            "You have spent 3+ consecutive turns patching without calling complete. STOP patching and call complete NOW with a summary.",
        });
      } else if (resolvedEditIntent === "patch" && graphIsValid(state)) {
        messages.push({
          role: "user",
          content: "Graph is valid — call complete with a summary of your edits.",
        });
      } else {
        const hadAddNode = result.tool_calls.some((tc) => tc.name === "add_node");
        const hadAddEdge = result.tool_calls.some((tc) => tc.name === "add_edge");
        if (hadAddNode && !hadAddEdge && state.graph.nodes.length >= 2) {
          messages.push({
            role: "user",
            content: `You added nodes but did not call add_edge. Wire the workflow now using exact node ids and compatible ports.\n\n${buildValidationReminder(state) || graphSummary(state.graph)}`,
          });
        } else {
          const reminder = buildValidationReminder(state);
          if (reminder) {
            messages.push({
              role: "user",
              content: reminder,
            });
          }
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
