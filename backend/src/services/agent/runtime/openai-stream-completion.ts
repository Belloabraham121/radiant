import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import type { ChatCompletionMessage } from "openai/resources/chat/completions.js";

type AccumulatedToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type StreamCompletionHandlers = {
  onContentDelta?: (text: string) => void;
  onToolCallDelta?: (toolCall: AccumulatedToolCall, index: number) => void;
};

export async function streamChatCompletion(
  client: OpenAI,
  params: {
    model: string;
    messages: ChatCompletionMessageParam[];
    tools: OpenAI.Chat.Completions.ChatCompletionTool[];
    max_tokens?: number;
  },
  handlers: StreamCompletionHandlers = {},
): Promise<ChatCompletionMessage> {
  const stream = await client.chat.completions.create({
    model: params.model,
    messages: params.messages,
    tools: params.tools,
    tool_choice: "auto",
    max_tokens: params.max_tokens,
    stream: true,
  });

  let content = "";
  const toolCalls: AccumulatedToolCall[] = [];

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;

    if (delta.content) {
      content += delta.content;
      handlers.onContentDelta?.(delta.content);
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
          entry.arguments += toolDelta.function.arguments;
          handlers.onToolCallDelta?.(entry, index);
        }
      }
    }
  }

  return {
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
  };
}
