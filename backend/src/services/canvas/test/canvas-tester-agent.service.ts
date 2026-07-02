import { AppError } from "../../../errors/app-error.js";
import {
  emitWorkflowRunError,
  getCanvasTesterLlmConfig,
  runWithCanvasDryRunProgress,
} from "./canvas-test-progress-context.js";
import type { CanvasDryRunStreamSender } from "./canvas-test-progress.types.js";
import {
  CANVAS_TESTER_TOOL_DEFINITIONS,
  runTesterTool,
  type TesterRunState,
} from "./canvas-tester-tools.js";
import { getCanvasLlmProvider } from "../llm/canvas-llm-provider.registry.js";
import type { CanvasAgentLlmConfig, CanvasLlmMessage } from "../llm/canvas-llm.types.js";
import { executeDryRunSimulation } from "../runtime/dry-run-simulator.js";
import { getUserWorkflow } from "../canvas-workflow.service.js";

const TESTER_SYSTEM_PROMPT = `You are the Radiant Canvas Tester agent. Your job is to dry-run the user's workflow graph.

Rules:
1. Always call run_dry_run first to simulate the full graph — no on-chain submit.
2. Simulated actions are annotated with simulated: true.
3. Surface policy warnings from the dry run in your summary.
4. workflow-approve nodes are auto-approved in dry run unless the user disabled it.
5. Call complete with a concise summary when dry run finishes.

Use run_dry_run, then complete.`;

const MAX_TESTER_TURNS = 6;

export type RunCanvasDryRunStreamInput = {
  privyUserId: string;
  workflowId: string;
  message?: string;
  send: CanvasDryRunStreamSender;
  tester_config?: CanvasAgentLlmConfig;
};

export async function runCanvasDryRunStream(input: RunCanvasDryRunStreamInput): Promise<void> {
  const testerConfig = input.tester_config ?? { model_tier: "lite", provider: "openai" };

  await runWithCanvasDryRunProgress({ send: input.send, tester_config: testerConfig }, async () => {
    try {
      const useStub = process.env.CANVAS_TESTER_STUB === "true";
      if (useStub) {
        await runCanvasDryRunStreamStub(input.privyUserId, input.workflowId, input.send);
        return;
      }
      await executeTesterTurn(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Dry run failed.";
      emitWorkflowRunError(
        err instanceof AppError ? err.code : "DRY_RUN_ERROR",
        message,
      );
    }
  });
}

async function executeTesterTurn(input: RunCanvasDryRunStreamInput): Promise<void> {
  const workflow = await getUserWorkflow(input.privyUserId, input.workflowId);
  const state: TesterRunState = {
    workflowId: input.workflowId,
    privyUserId: input.privyUserId,
  };

  const llmConfig = getCanvasTesterLlmConfig();
  const providerId = llmConfig.provider ?? "openai";
  const provider = getCanvasLlmProvider(providerId);
  const model = provider.resolveModel(llmConfig.model_tier);

  const userNote = input.message?.trim()
    ? input.message.trim()
    : "Run a full dry-run of this workflow.";

  const messages: CanvasLlmMessage[] = [
    { role: "system", content: TESTER_SYSTEM_PROMPT },
    {
      role: "user",
      content: `${userNote}\n\nWorkflow: ${workflow.name} (rev ${workflow.revision}, status ${workflow.status})`,
    },
  ];

  let completed = false;

  for (let turn = 0; turn < MAX_TESTER_TURNS && !completed; turn += 1) {
    const result = await provider.completeWithTools({
      model,
      messages,
      tools: CANVAS_TESTER_TOOL_DEFINITIONS as import("../llm/canvas-llm.types.js").CanvasLlmToolDefinition[],
      max_tokens: llmConfig.model_tier === "thinking" ? 2048 : 1024,
      temperature: 0.1,
    });

    if (result.content.trim()) {
      messages.push({ role: "assistant", content: result.content });
    }

    if (result.tool_calls.length === 0) {
      if (turn === MAX_TESTER_TURNS - 1) {
        throw new AppError(422, "DRY_RUN_INCOMPLETE", "Tester did not finish the dry run.");
      }
      messages.push({
        role: "user",
        content: "Call run_dry_run to simulate the workflow, then complete.",
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

      const toolResult = await runTesterTool(toolCall.name, parsedArgs, state);
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
    throw new AppError(422, "DRY_RUN_INCOMPLETE", "Tester reached turn limit without completing.");
  }
}

/** Deterministic dry run for tests — executes simulator without LLM. */
export async function runCanvasDryRunStreamStub(
  privyUserId: string,
  workflowId: string,
  send?: CanvasDryRunStreamSender,
): Promise<void> {
  const run = async () => {
    await executeDryRunSimulation({
      privyUserId,
      workflowId,
      autoApprove: true,
    });
  };

  if (send) {
    await runWithCanvasDryRunProgress({ send }, run);
  } else {
    await run();
  }
}
