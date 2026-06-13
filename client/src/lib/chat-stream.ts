import { ApiError } from "@/lib/api";
import type { ChatRequest, ChatResponse } from "@/lib/chat-api";
import type { StreamExecutionStepPayload } from "@/lib/chat-execution-steps";

export type ChatStreamHandlers = {
  onStep?: (step: StreamExecutionStepPayload) => void;
};

function parseSseBlock(block: string): { event: string; data: string } | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return { event, data: dataLines.join("\n") };
}

export async function postChatStream(
  body: ChatRequest,
  handlers: ChatStreamHandlers = {},
): Promise<ChatResponse> {
  const response = await fetch("/api/v1/chat?stream=1", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = "Could not reach your agent. Try again.";
    try {
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      if (payload.error?.message) {
        message = payload.error.message;
      }
    } catch {
      // non-json error body
    }
    throw new ApiError(response.status, "CHAT_STREAM_FAILED", message);
  }

  if (!response.body) {
    throw new ApiError(502, "CHAT_STREAM_EMPTY", "Streaming response was empty.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResponse: ChatResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const parsed = parseSseBlock(block);
      if (parsed) {
        const payload = JSON.parse(parsed.data) as unknown;

        if (parsed.event === "step") {
          const step = (payload as { step: StreamExecutionStepPayload }).step;
          handlers.onStep?.(step);
        } else if (parsed.event === "done") {
          finalResponse = payload as ChatResponse;
        } else if (parsed.event === "error") {
          const message = (payload as { message?: string }).message ?? "Agent request failed.";
          throw new ApiError(502, "CHAT_STREAM_ERROR", message);
        }
      }

      boundary = buffer.indexOf("\n\n");
    }
  }

  if (!finalResponse) {
    throw new ApiError(502, "CHAT_STREAM_INCOMPLETE", "Agent stream ended without a final response.");
  }

  return finalResponse;
}
