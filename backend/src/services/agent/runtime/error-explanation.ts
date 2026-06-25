import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { getOpenAiConfig } from "../../../config/agent.js";
import { AppError } from "../../../errors/app-error.js";
import {
  toolErrorToModelContent,
  type AgentToolErrorPayload,
} from "../../../utils/agent-tool-errors.js";
import type { AgentPermissions } from "../agent-permissions.types.js";
import type { AgentToolErrorResult } from "../tools.js";
import { REPLY_AFTER_TOOLS_NUDGE } from "../turn-reply-flow.js";
import {
  buildTransactionErrorUserContext,
  type TransactionErrorContext,
} from "../deepbook/transaction-error-context.js";
import { buildSystemPrompt } from "./prompts.js";
import type { AgentPromptContext } from "../prompts/prompt-context.js";
import { openAiMaxOutputTokens } from "./openai-completion-params.js";
import type { AgentTurnMessage } from "./types.js";

export const ERROR_EXPLANATION_NUDGE =
  "Write a short, friendly reply to the user explaining what went wrong and what they can do next. " +
  "Do not quote error codes, JSON, stack traces, or internal tool names.";

export function isAgentToolErrorResult(result: unknown): result is AgentToolErrorResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof (result as AgentToolErrorResult).error?.message === "string"
  );
}

/** Switch-based routing for the model — never shown directly to the user. */
export function buildErrorExplanationInstructions(input: {
  toolName: string;
  error: AgentToolErrorPayload;
  transactionContext?: TransactionErrorContext;
  userContext?: string;
  compoundRequest?: boolean;
}): string {
  const parts: string[] = [];

  if (input.compoundRequest) {
    parts.push(
      "The user's message asked MULTIPLE things (e.g. market price AND a conditional swap). " +
        "Your reply MUST cover both in order: " +
        "(1) Answer every informational question first — use deepbook_pool_info, ticker, or swap_quote data from earlier tool results in this turn. " +
        "Include the price and whether it looks reasonable if they asked. " +
        "(2) Then explain what happened with execute_transaction (submitted, needs approval, or why it failed — e.g. below min_size/lot_size). " +
        "Never skip part (1) because part (2) failed.",
    );
  }

  if (input.userContext) {
    parts.push(input.userContext);
  }

  const txContextLine = buildTransactionErrorUserContext(input.transactionContext);
  if (txContextLine) {
    parts.push(txContextLine);
  }

  switch (input.error.code) {
    case "INSUFFICIENT_BALANCE":
      switch (input.transactionContext?.action) {
        case "deepbook_withdraw":
          parts.push(
            "The failure is about DeepBook balance manager funds, not the user's main wallet balance. " +
              "If they asked to withdraw more than the manager holds, say how much is in the manager vs what they requested.",
          );
          break;
        case "deepbook_deposit":
          parts.push(
            "The failure is about funding a DeepBook deposit from the agent wallet. " +
              "Mention the agent wallet may lack that token or SUI for gas.",
          );
          break;
        case "swap":
        case "deepbook_swap":
          parts.push(
            "The failure is about a swap from the agent wallet. " +
              "If the error mentions network gas, explain the wallet needs SUI for gas in addition to the swap amount — suggest a smaller swap or adding SUI.",
          );
          break;
        case "cross_chain_swap":
        case "lifi_approve":
          parts.push(
            "The failure is about an EVM cross-chain bridge or swap from the agent wallet. " +
              "Explain the user needs enough of the source token on the specific EVM network (e.g. Base, Arbitrum, Ethereum) AND native ETH on that same network for gas. " +
              "Suggest funding the agent wallet on that network or using a smaller amount.",
          );
          break;
        default:
          parts.push(
            "Explain which balance is too low (wallet vs DeepBook manager) based on what they were trying to do.",
          );
          break;
      }
      break;
    case "SLIPPAGE_EXCEEDED":
      parts.push(
        "Explain the swap could not complete because the price moved. Suggest a smaller size or retrying.",
      );
      break;
    case "TRANSACTION_FAILED":
    case "TRANSACTION_ERROR":
      switch (input.transactionContext?.action) {
        case "deepbook_withdraw":
          parts.push(
            "The on-chain DeepBook withdrawal failed. Focus on DeepBook manager balance, not wallet swap wording.",
          );
          break;
        case "deepbook_deposit":
          parts.push("The on-chain DeepBook deposit failed. Focus on agent wallet funds and gas.");
          break;
        default:
          parts.push("Explain the on-chain transaction failed in plain language for what they attempted.");
          break;
      }
      break;
    case "VALIDATION_ERROR":
      if (input.compoundRequest) {
        parts.push(
          "The swap could not run because of DeepBook size rules (min_size, lot_size) or invalid params. " +
            "Mention the pool minimum/lot from pool_info if available, then suggest a larger amount.",
        );
      } else {
        parts.push("Explain what parameter was missing or invalid and how to fix the request.");
      }
      break;
    default:
      parts.push("Explain the failure in plain language for the specific action they attempted.");
      break;
  }

  parts.push(
    `The ${input.toolName} tool failed.`,
    ERROR_EXPLANATION_NUDGE,
    `Tool result:\n${toolErrorToModelContent(input.error)}`,
  );

  return parts.join("\n\n");
}

export async function explainTransactionError(input: {
  client: OpenAI;
  model: string;
  messages: ChatCompletionMessageParam[];
  toolName: string;
  toolResult: AgentToolErrorResult;
  transactionContext?: TransactionErrorContext;
  userContext?: string;
  compoundRequest?: boolean;
}): Promise<string> {
  const instruction = buildErrorExplanationInstructions({
    toolName: input.toolName,
    error: input.toolResult.error,
    transactionContext: input.transactionContext,
    userContext: input.userContext,
    compoundRequest: input.compoundRequest,
  });

  const completion = await input.client.chat.completions.create({
    model: input.model,
    messages: [...input.messages, { role: "user", content: instruction }],
    ...openAiMaxOutputTokens(input.model, 512),
  });

  const reply = completion.choices[0]?.message?.content?.trim();
  if (!reply) {
    throw new AppError(
      502,
      "ERROR_EXPLANATION_EMPTY",
      "The agent could not generate an error explanation.",
    );
  }

  return reply;
}

export async function synthesizeTurnReply(input: {
  client: OpenAI;
  model: string;
  messages: ChatCompletionMessageParam[];
}): Promise<string> {
  const completion = await input.client.chat.completions.create({
    model: input.model,
    messages: [...input.messages, { role: "user", content: REPLY_AFTER_TOOLS_NUDGE }],
    ...openAiMaxOutputTokens(input.model, 1024),
  });

  const reply = completion.choices[0]?.message?.content?.trim();
  if (!reply) {
    throw new AppError(
      502,
      "TURN_REPLY_EMPTY",
      "The agent could not generate a reply from tool results.",
    );
  }

  return reply;
}

function fallbackErrorExplanationMessage(toolResult: AgentToolErrorResult): string {
  const message = toolResult.error.message?.trim();
  return message || "Something went wrong. Try again in a moment.";
}

export async function synthesizeErrorExplanationReply(input: {
  toolName: string;
  toolResult: AgentToolErrorResult;
  messages: AgentTurnMessage[];
  memoryBlock?: string;
  agentPermissions?: AgentPermissions;
  userContext?: string;
  transactionContext?: TransactionErrorContext;
  promptContext?: AgentPromptContext;
  compoundRequest?: boolean;
}): Promise<string> {
  const { apiKey, model } = getOpenAiConfig();
  if (!apiKey) {
    return fallbackErrorExplanationMessage(input.toolResult);
  }

  const client = new OpenAI({ apiKey });
  const lastUserMessage =
    input.promptContext?.userMessage ??
    [...input.messages].reverse().find((message) => message.role === "user")?.content;

  try {
    return await explainTransactionError({
      client,
      model,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(
            buildSystemPromptInputFromContext({
              memoryBlock: input.memoryBlock,
              agentPermissions: input.agentPermissions,
              promptContext: {
                ...input.promptContext,
                userMessage: lastUserMessage,
                forceFullMode: input.compoundRequest === true,
              },
            }),
          ),
        },
        ...input.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
      toolName: input.toolName,
      toolResult: input.toolResult,
      transactionContext: input.transactionContext,
      userContext: input.userContext,
      compoundRequest: input.compoundRequest,
    });
  } catch {
    return fallbackErrorExplanationMessage(input.toolResult);
  }
}
