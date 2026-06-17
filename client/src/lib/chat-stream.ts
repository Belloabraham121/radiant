import { ApiError } from "@/lib/api";
import type { ChatRequest, ChatResponse } from "@/lib/chat-api";
import type { ArtifactPayload } from "@/lib/artifact-types";
import type { StreamExecutionStepPayload } from "@/lib/chat-execution-steps";
import type { AgentStatusCategory } from "@/lib/agent-status-category";
import { isAgentStatusCategory } from "@/lib/agent-status-category";

export type ChatStreamHandlers = {
  onStep?: (step: StreamExecutionStepPayload) => void;
  onStatus?: (category: AgentStatusCategory) => void;
  onArtifact?: (payload: { artifact: ArtifactPayload; streaming: boolean }) => void;
  onReplyDelta?: (delta: string) => void;
  onReplyClear?: () => void;
  onSession?: (sessionId: string) => void;
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

export class ChatStreamAbortedError extends Error {
  constructor() {
    super("Request stopped.");
    this.name = "ChatStreamAbortedError";
  }
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof ChatStreamAbortedError ||
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

export async function postChatStream(
  body: ChatRequest,
  handlers: ChatStreamHandlers = {},
  options: { signal?: AbortSignal } = {},
): Promise<ChatResponse> {
  let response: Response;
  try {
    response = await fetch("/api/v1/chat?stream=1", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (err) {
    if (isAbortError(err) || options.signal?.aborted) {
      throw new ChatStreamAbortedError();
    }
    throw err;
  }

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

  try {
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
        } else if (parsed.event === "status") {
          const category = (payload as { category?: string }).category;
          if (category && isAgentStatusCategory(category)) {
            handlers.onStatus?.(category);
          }
        } else if (parsed.event === "reply") {
          const delta = (payload as { delta?: string }).delta;
          if (delta) {
            handlers.onReplyDelta?.(delta);
          }
        } else if (parsed.event === "reply_clear") {
          handlers.onReplyClear?.();
        } else if (parsed.event === "artifact") {
          const artifactPayload = payload as { artifact: ArtifactPayload; streaming: boolean };
          handlers.onArtifact?.(artifactPayload);
        } else if (parsed.event === "session") {
          const sessionId = (payload as { session_id?: string }).session_id;
          if (sessionId) {
            handlers.onSession?.(sessionId);
          }
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
  } catch (err) {
    if (isAbortError(err) || options.signal?.aborted) {
      throw new ChatStreamAbortedError();
    }
    throw err;
  }

  if (!finalResponse) {
    throw new ApiError(502, "CHAT_STREAM_INCOMPLETE", "Agent stream ended without a final response.");
  }

  return finalResponse;
}
