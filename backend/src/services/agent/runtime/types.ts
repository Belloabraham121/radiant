import type { AgentPermissions } from "../agent-permissions.types.js";
import type { ExecuteToolOutcome, PendingTransaction, ToolCallRecord } from "../agent.types.js";
import type { PinnedAppScope } from "../../projects/pinned-app-scope.types.js";
import type { AgentPromptContext } from "../prompts/prompt-context.js";

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
  /** User-pinned app from chat composer — scopes call_app_action and artifact edits. */
  pinnedAppScope?: PinnedAppScope | null;
  /** Server-injected source for pinned editable apps. */
  artifactContextBlock?: string;
  /** Scoped prompt resolution — user message, sticky modules, workflow plan hints. */
  promptContext?: AgentPromptContext;
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
