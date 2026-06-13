export type ExecuteTransactionContext = {
  sessionId?: string;
  messageId?: string;
  workflowStepIndex?: number;
};

export type AgentToolOptions = ExecuteTransactionContext & {
  approved?: boolean;
};

export function resolveExecuteTransactionOptions(
  options: AgentToolOptions | boolean = {},
): AgentToolOptions {
  if (typeof options === "boolean") {
    return { approved: options };
  }
  return options;
}
