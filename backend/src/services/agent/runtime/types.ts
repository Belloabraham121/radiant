import type { AgentPermissions } from "../agent-permissions.types.js";
import type { ExecuteToolOutcome, PendingTransaction, ToolCallRecord } from "../agent.types.js";

export type AgentRuntimeId = "openai" | "stub";

export type AgentTurnMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentTurnInput = {
  privyUserId: string;
  sessionId: string;
  messages: AgentTurnMessage[];
  memoryBlock?: string;
  agentPermissions?: AgentPermissions;
  /** When true, invoked from sequential workflow — avoid nested workflow routing. */
  workflowMode?: boolean;
};

export type AgentTurnResult = {
  reply: string;
  tool_calls: ToolCallRecord[];
  pending_transaction: PendingTransaction | null;
};

export interface AgentRuntime {
  readonly id: AgentRuntimeId;
  runTurn(input: AgentTurnInput): Promise<AgentTurnResult>;
}

export type { ExecuteToolOutcome };
