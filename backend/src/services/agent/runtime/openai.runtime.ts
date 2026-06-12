import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { getOpenAiConfig } from "../../../config/agent.js";
import { AppError } from "../../../errors/app-error.js";
import type { ExecuteToolOutcome } from "../agent.types.js";
import {
  shouldNudgeSwapExecute,
  SWAP_EXECUTE_NUDGE,
} from "../swap-approval-flow.js";
import { agentToolDefinitions, runAgentTool } from "../tools.js";
import { buildSystemPrompt } from "./prompts.js";
import { toOpenAiTools } from "./openai-tools.js";
import { summarizeToolResult } from "./summarize-tool-result.js";
import type { AgentRuntime, AgentTurnInput, AgentTurnResult } from "./types.js";

function mapOpenAiError(err: unknown): AppError {
  if (err instanceof OpenAI.APIError) {
    if (err.status === 401) {
      return new AppError(502, "OPENAI_AUTH_ERROR", "OpenAI API authentication failed.");
    }
    if (err.status === 429) {
      return new AppError(
        503,
        "OPENAI_RATE_LIMIT",
        "OpenAI rate limit exceeded. Try again shortly.",
      );
    }
    return new AppError(
      502,
      "OPENAI_ERROR",
      `OpenAI API error (${err.status}): ${err.message}`.slice(0, 500),
    );
  }

  if (err instanceof AppError) {
    return err;
  }

  return new AppError(500, "OPENAI_UNEXPECTED", "Unexpected OpenAI client error.");
}

export const openaiRuntime: AgentRuntime = {
  id: "openai",

  async runTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
    const { apiKey, model, maxToolSteps } = getOpenAiConfig();
    if (!apiKey) {
      throw new AppError(503, "OPENAI_NOT_CONFIGURED", "OPENAI_API_KEY is not set");
    }

    const client = new OpenAI({ apiKey });
    const tools = toOpenAiTools(agentToolDefinitions);

    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: buildSystemPrompt({
          memoryBlock: input.memoryBlock,
          agentPermissions: input.agentPermissions,
        }),
      },
      ...input.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ];

    const tool_calls: AgentTurnResult["tool_calls"] = [];
    let pending_transaction: AgentTurnResult["pending_transaction"] = null;
    let reply = "";
    const lastUserMessage =
      [...input.messages].reverse().find((message) => message.role === "user")?.content ?? "";

    for (let step = 0; step < maxToolSteps; step += 1) {
      let completion;
      try {
        completion = await client.chat.completions.create({
          model,
          messages,
          tools,
          tool_choice: "auto",
          max_tokens: 1024,
        });
      } catch (err) {
        throw mapOpenAiError(err);
      }

      const choice = completion.choices[0]?.message;
      if (!choice) {
        throw new AppError(502, "OPENAI_EMPTY_RESPONSE", "OpenAI returned no completion choice.");
      }

      const toolCallList = choice.tool_calls ?? [];
      if (toolCallList.length === 0) {
        if (shouldNudgeSwapExecute(tool_calls, lastUserMessage)) {
          messages.push({
            role: "user",
            content: SWAP_EXECUTE_NUDGE,
          });
          continue;
        }

        reply = choice.content?.trim() || "Done.";
        break;
      }

      messages.push(choice);

      for (const toolCall of toolCallList) {
        if (toolCall.type !== "function") continue;

        let args: Record<string, unknown>;
        try {
          args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        } catch {
          args = {};
        }

        const result = await runAgentTool(input.privyUserId, toolCall.function.name, args);
        tool_calls.push({ name: toolCall.function.name, result });

        if (toolCall.function.name === "execute_transaction") {
          const outcome = result as ExecuteToolOutcome;
          if (
            typeof outcome === "object" &&
            outcome !== null &&
            outcome.status === "approval_required"
          ) {
            pending_transaction = outcome.pending;
          }
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: summarizeToolResult(toolCall.function.name, result),
        });
      }

      if (pending_transaction) {
        reply =
          "This transaction needs your approval before I can broadcast it. Review the quote and confirm in the dialog.";
        break;
      }
    }

    if (!reply) {
      reply = "I processed your request.";
    }

    return { reply, tool_calls, pending_transaction };
  },
};
