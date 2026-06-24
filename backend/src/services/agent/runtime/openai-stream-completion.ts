import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import type { ChatCompletionMessage } from "openai/resources/chat/completions.js";
import { openAiMaxOutputTokens } from "./openai-completion-params.js";

type AccumulatedToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type StreamCompletionHandlers = {
  onContentDelta?: (text: string) => void;
  onToolCallDelta?: (toolCall: AccumulatedToolCall, index: number) => void;
};

export type StreamCompletionLimits = {
  maxContentChars?: number;
  maxToolArgsChars?: number;
};

export type StreamChatCompletionResult = {
  message: ChatCompletionMessage;
  contentTruncated: boolean;
  toolArgsTruncated: boolean;
};

function appendBoundedContent(
  current: string,
  delta: string,
  maxChars: number | undefined,
): { content: string; chunk: string; truncated: boolean } {
  if (!delta) {
    return { content: current, chunk: "", truncated: false };
  }
  if (maxChars == null) {
    return { content: current + delta, chunk: delta, truncated: false };
  }
  if (current.length >= maxChars) {
    return { content: current, chunk: "", truncated: true };
  }
  const remaining = maxChars - current.length;
  if (delta.length <= remaining) {
    return { content: current + delta, chunk: delta, truncated: false };
  }
  const chunk = delta.slice(0, remaining);
  return { content: current + chunk, chunk, truncated: true };
}

function appendBoundedToolArgs(
  current: string,
  delta: string,
  maxChars: number | undefined,
): { arguments: string; chunk: string; truncated: boolean } {
  if (!delta) {
    return { arguments: current, chunk: "", truncated: false };
  }
  if (maxChars == null) {
    return { arguments: current + delta, chunk: delta, truncated: false };
  }
  if (current.length >= maxChars) {
    return { arguments: current, chunk: "", truncated: true };
  }
  const remaining = maxChars - current.length;
  if (delta.length <= remaining) {
    return { arguments: current + delta, chunk: delta, truncated: false };
  }
  const chunk = delta.slice(0, remaining);
  return { arguments: current + chunk, chunk, truncated: true };
}

export async function streamChatCompletion(
  client: OpenAI,
  params: {
    model: string;
    messages: ChatCompletionMessageParam[];
    tools: OpenAI.Chat.Completions.ChatCompletionTool[];
    max_tokens?: number;
    limits?: StreamCompletionLimits;
  },
  handlers: StreamCompletionHandlers = {},
): Promise<StreamChatCompletionResult> {
  const stream = await client.chat.completions.create({
    model: params.model,
    messages: params.messages,
    tools: params.tools,
    tool_choice: "auto",
    ...openAiMaxOutputTokens(params.model, params.max_tokens ?? 1024),
    stream: true,
  });

  let content = "";
  let contentTruncated = false;
  let toolArgsTruncated = false;
  const toolCalls: AccumulatedToolCall[] = [];
  const maxContentChars = params.limits?.maxContentChars;
  const maxToolArgsChars = params.limits?.maxToolArgsChars;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;

    if (delta.content) {
      const next = appendBoundedContent(content, delta.content, maxContentChars);
      content = next.content;
      if (next.truncated) {
        contentTruncated = true;
      }
      if (next.chunk) {
        handlers.onContentDelta?.(next.chunk);
      }
    }

    if (delta.tool_calls) {
      for (const toolDelta of delta.tool_calls) {
        const index = toolDelta.index ?? 0;
        if (!toolCalls[index]) {
          toolCalls[index] = { id: "", name: "", arguments: "" };
        }
        const entry = toolCalls[index];
        if (toolDelta.id) entry.id = toolDelta.id;
        if (toolDelta.function?.name) entry.name = toolDelta.function.name;
        if (toolDelta.function?.arguments) {
          const next = appendBoundedToolArgs(
            entry.arguments,
            toolDelta.function.arguments,
            maxToolArgsChars,
          );
          entry.arguments = next.arguments;
          if (next.truncated) {
            toolArgsTruncated = true;
          }
          if (next.chunk) {
            handlers.onToolCallDelta?.(entry, index);
          }
        }
      }
    }
  }

  return {
    message: {
      role: "assistant",
      content: content || null,
      refusal: null,
      tool_calls:
        toolCalls.length > 0
          ? toolCalls.map((call, index) => ({
              id: call.id || `call_${index}`,
              type: "function" as const,
              function: {
                name: call.name,
                arguments: call.arguments,
              },
            }))
          : undefined,
    },
    contentTruncated,
    toolArgsTruncated,
  };
}
