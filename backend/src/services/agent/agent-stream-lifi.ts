import type { ExecutionProgressStep } from "./execution-progress.types.js";
import { emitAgentEvent } from "./agent-stream.service.js";

/** Push execution timeline steps to live chat SSE subscribers for a session. */
export function emitAgentStreamExecutionStep(
  sessionId: string | null | undefined,
  step: ExecutionProgressStep,
): void {
  if (!sessionId) {
    return;
  }

  emitAgentEvent(sessionId, "execution_step", {
    execution_step: {
      id: step.id,
      status: step.status,
      label: step.label,
      ...(step.detail ? { detail: step.detail } : {}),
      ...(step.agent_transaction_id ? { agent_transaction_id: step.agent_transaction_id } : {}),
      ...(step.digest ? { digest: step.digest } : {}),
      ...(step.chain_id ? { chain_id: step.chain_id } : {}),
      ...(step.status_category ? { status_category: step.status_category } : {}),
    },
  });
}
