import OpenAI from "openai";
import { getOpenAiConfig } from "../../../config/agent.js";
import { AppError } from "../../../errors/app-error.js";
import {
  toolErrorToModelContent,
  type AgentToolErrorPayload,
} from "../../../utils/agent-tool-errors.js";
import type { AgentPermissions } from "../agent-permissions.types.js";
import type { AgentToolErrorResult } from "../tools.js";
import { buildSystemPrompt } from "./prompts.js";
import type { AgentTurnMessage } from "./types.js";

export const ERROR_EXPLANATION_NUDGE =
  "Explain what went wrong in plain, friendly language and tell me what I can do next. " +
  "Do not quote error codes, JSON, or stack traces.";

export function isAgentToolErrorResult(result: unknown): result is AgentToolErrorResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof (result as AgentToolErrorResult).error?.message === "string"
  );
}

export function fallbackErrorReply(error: AgentToolErrorPayload): string {
  switch (error.code) {
    case "INSUFFICIENT_BALANCE":
      return (
        "That swap could not go through because your agent wallet does not have enough SUI " +
        "(or gas) for the amount you asked for. Try a smaller swap or add funds to your agent wallet first."
      );
    case "SLIPPAGE_EXCEEDED":
      return "The swap could not complete because the price moved too much. Try a smaller amount or retry shortly.";
    case "TRANSACTION_FAILED":
    case "TRANSACTION_ERROR":
      return (
        "That transaction could not be completed on chain. " +
        "If you were swapping, check that your wallet has enough of the input token and a little SUI for gas."
      );
    default:
      return (
        "Something went wrong while preparing that transaction. " +
        "Try a smaller amount, check your wallet balance, or ask me to look up your balance first."
      );
  }
}

export async function synthesizeErrorExplanationReply(input: {
  toolName: string;
  toolResult: AgentToolErrorResult;
  messages: AgentTurnMessage[];
  memoryBlock?: string;
  agentPermissions?: AgentPermissions;
  userContext?: string;
}): Promise<string> {
  const { apiKey, model } = getOpenAiConfig();
  if (!apiKey) {
    return fallbackErrorReply(input.toolResult.error);
  }

  const client = new OpenAI({ apiKey });
  const contextLine = input.userContext ? `${input.userContext}\n\n` : "";

  try {
    const completion = await client.chat.completions.create({
      model,
      tool_choice: "none",
      max_tokens: 512,
      messages: [
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
        {
          role: "user",
          content:
            `${contextLine}The ${input.toolName} tool failed.\n\n` +
            `${ERROR_EXPLANATION_NUDGE}\n\n` +
            `Tool result:\n${toolErrorToModelContent(input.toolResult.error)}`,
        },
      ],
    });

    return (
      completion.choices[0]?.message?.content?.trim() ??
      fallbackErrorReply(input.toolResult.error)
    );
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    return fallbackErrorReply(input.toolResult.error);
  }
}
