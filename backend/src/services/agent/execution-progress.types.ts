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
};

export type ExecutionProgressEvent = {
  step: ExecutionProgressStep;
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
  event: "step" | "done" | "error",
  data: ExecutionProgressEvent | ChatStreamDoneEvent | { message: string },
) => void;
