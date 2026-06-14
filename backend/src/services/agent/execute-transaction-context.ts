export type ExecuteTransactionContext = {
  sessionId?: string;
  messageId?: string;
  workflowStepIndex?: number;
};

export type AgentToolOptions = ExecuteTransactionContext & {
  approved?: boolean;
  /** Raw JSON tool arguments — used to recover partial generate_app payloads. */
  rawArguments?: string;
};

export function resolveExecuteTransactionOptions(
  options: AgentToolOptions | boolean = {},
): AgentToolOptions {
  if (typeof options === "boolean") {
    return { approved: options };
  }
  return options;
}
