import type { ChatResponse } from "./agent.types.js";
import type { ArtifactPayload } from "../projects/project.types.js";
import type { AgentStatusCategory } from "./agent-status-category.js";

export type ExecutionStepStatus =
  | "pending"
  | "running"
  | "ok"
  | "failed"
  | "skipped"
  | "warning";

export type ExecutionProgressStep = {
  id: string;
  status: ExecutionStepStatus;
  label: string;
  detail?: string;
  agent_transaction_id?: string;
  digest?: string;
  chain_id?: string;
  evm_chain_id?: number;
  /** Drives playful status phrases on the client (thinking, defi, etc.). */
  status_category?: AgentStatusCategory;
  /** Li-Fi ETA countdown — client ticks locally from bridge_started_at. */
  estimated_duration_seconds?: number | null;
  bridge_started_at?: string | null;
  countdown_kind?: "bridge" | "swap";
};

export type ExecutionProgressEvent = {
  step: ExecutionProgressStep;
};

export type AgentStatusEvent = {
  category: AgentStatusCategory;
};

export type ChatStreamStepEvent = ExecutionProgressEvent;

export type ChatStreamDoneEvent = {
  reply: string;
  session_id: string;
  mode: "openai" | "stub";
  tool_calls: Array<{ name: string; result: unknown }>;
  pending_transaction: unknown;
  pending_clarification: unknown;
  message_id: string;
};

export type ChatStreamSender = (
  event:
    | "step"
    | "status"
    | "artifact"
    | "reply"
    | "reply_clear"
    | "session"
    | "done"
    | "error",
  data:
    | ExecutionProgressEvent
    | AgentStatusEvent
    | { artifact: ArtifactPayload; streaming: boolean }
    | { delta: string }
    | { session_id: string }
    | ChatStreamDoneEvent
    | ChatResponse
    | { message: string }
    | null,
) => void;
