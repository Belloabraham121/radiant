import {
  agentStreamContextFromToolOptions,
  emitAgentStreamExecutionError,
  emitAgentStreamExecutionOutcome,
  emitAgentStreamExecutionStart,
  resolveAgentStreamAction,
} from "./agent-stream-execution.js";
import { mapAgentToolError } from "../../utils/agent-tool-errors.js";
import type { ExecuteTransactionInput } from "../chains/types.js";
import type { ExecuteToolOutcome } from "./agent.types.js";
import { runExecuteTransactionTool } from "./tools/execute-transaction.tool.js";
import {
  createPendingTransaction,
  transferRequiresApproval,
} from "./transaction-approval.service.js";
import {
  resolveExecuteTransactionOptions,
  type AgentToolOptions,
} from "./execute-transaction-context.js";
import { validateExecuteTransactionInput } from "./chains/sui/deepbook/validate.js";
import { validateExecuteTransactionToolPolicy } from "./tool-arg-policy.js";
import { getEnabledChainConfigs } from "../../config/chains.js";
import { runExecutePreflightHooks } from "./chains/registry.js";
import {
  recordAutoExecuted,
  markCompleted,
  markLifiSubmitted,
} from "../agent-transaction/agent-transaction.service.js";
import { enqueueLifiCrossChainTrackingJob, enqueueLifiSwapTrackingJob } from "../../infrastructure/inngest/enqueue-lifi-tracking.js";
import { isLifiExecuteAction } from "./chains/evm/lifi/execute-actions.js";
import {
  readLifiTrackingFromTxResult,
  shouldEnqueueLifiCrossChainTracking,
  shouldEnqueueLifiSwapTracking,
} from "../defi/lifi/lifi-tracking.js";
import { buildInitialLifiExecutionSteps } from "../defi/lifi/lifi-status-tracker.service.js";
import { emitAgentStreamExecutionStep } from "./agent-stream-lifi.js";
import { runWithLifiExecuteContext } from "../defi/lifi/lifi-execute-context.js";

type ExecuteWithApprovalHandler = (
  privyUserId: string,
  input: ExecuteTransactionInput,
  options?: AgentToolOptions | boolean,
) => Promise<ExecuteToolOutcome>;

let executeWithApprovalHandlerForTests: ExecuteWithApprovalHandler | null = null;

/** Test hook — stub on-chain execution for app-action / workflow integration tests. */
export function setExecuteTransactionWithApprovalHandlerForTests(
  handler: ExecuteWithApprovalHandler | null,
): void {
  executeWithApprovalHandlerForTests = handler;
}

export async function runExecuteTransactionToolWithApproval(
  privyUserId: string,
  input: ExecuteTransactionInput,
  options: AgentToolOptions | boolean = {},
): Promise<ExecuteToolOutcome> {
  const opts = resolveExecuteTransactionOptions(options);
  const streamCtx = agentStreamContextFromToolOptions(opts);
  const streamAction = resolveAgentStreamAction(input);
  const streamParams = (input.params ?? {}) as Record<string, unknown>;

  validateExecuteTransactionInput(input);
  validateExecuteTransactionToolPolicy(input);
  emitAgentStreamExecutionStart(streamCtx, streamAction, streamParams);

  try {
    if (executeWithApprovalHandlerForTests) {
      const outcome = await executeWithApprovalHandlerForTests(privyUserId, input, options);
      emitAgentStreamExecutionOutcome(streamCtx, streamAction, outcome);
      return outcome;
    }

    const approved = opts.approved === true;
    const context = {
      sessionId: opts.sessionId,
      messageId: opts.messageId,
      workflowStepIndex: opts.workflowStepIndex,
    };

    if (!approved) {
      const needsApproval = await transferRequiresApproval(privyUserId, input, {
        pinnedAppScope: opts.pinnedAppScope,
        source: opts.source,
      });
      if (needsApproval) {
        const enabledChains = getEnabledChainConfigs().map((config) => config.id);
        await runExecutePreflightHooks(privyUserId, input, enabledChains);
        const pending = await createPendingTransaction(privyUserId, input, context);
        const outcome = {
          status: "approval_required" as const,
          pending,
          agent_transaction_id: pending.id,
        };
        emitAgentStreamExecutionOutcome(streamCtx, streamAction, outcome);
        return outcome;
      }
    }

    let transactionId: string | undefined;
    try {
      const row = await recordAutoExecuted({
        privyUserId,
        sessionId: context.sessionId,
        messageId: context.messageId,
        workflowStepIndex: context.workflowStepIndex,
        input,
      });
      transactionId = row.id;
    } catch (err) {
      console.warn("Failed to record auto-executed agent transaction", err);
    }

    try {
      const result = await runWithLifiExecuteContext(
        { sessionId: context.sessionId, transactionId },
        () => runExecuteTransactionTool(privyUserId, input),
      );
      const tracking = readLifiTrackingFromTxResult(result);
      const needsCrossChainTracking =
        isLifiExecuteAction(input.action) && shouldEnqueueLifiCrossChainTracking(result, tracking);
      const needsSwapTracking =
        isLifiExecuteAction(input.action) && shouldEnqueueLifiSwapTracking(result, tracking);
      const needsLifiTracking = needsCrossChainTracking || needsSwapTracking;

      if (transactionId && needsLifiTracking) {
        await markLifiSubmitted(transactionId, {
          digest: result.digest || tracking.tx_hashes[0] || null,
          effects_status: "pending",
          result,
        }).catch(() => undefined);

        if (context.sessionId) {
          for (const step of buildInitialLifiExecutionSteps({
            tracking,
            transactionId,
            chainId: result.chain_id,
            digest: result.digest || tracking.tx_hashes[0] || null,
            evmChainId: result.evm_chain_id ?? tracking.from_evm_chain_id,
          })) {
            emitAgentStreamExecutionStep(context.sessionId, step);
          }
        }

        const enqueue = needsSwapTracking
          ? enqueueLifiSwapTrackingJob
          : enqueueLifiCrossChainTrackingJob;
        void enqueue({
          transactionId,
          privyUserId,
          sessionId: context.sessionId ?? null,
          tracking,
        }).catch(() => undefined);
      } else if (transactionId) {
        await markCompleted(transactionId, { kind: "success", result }).catch(() => undefined);
      }

      const outcome = {
        status: "executed" as const,
        result,
        ...(transactionId ? { agent_transaction_id: transactionId } : {}),
      };
      emitAgentStreamExecutionOutcome(streamCtx, streamAction, outcome);
      return outcome;
    } catch (err) {
      if (transactionId) {
        const error = mapAgentToolError(err);
        await markCompleted(transactionId, {
          kind: "failure",
          error: { code: error.code, message: error.message },
        }).catch(() => undefined);
      }
      throw err;
    }
  } catch (err) {
    emitAgentStreamExecutionError(streamCtx, streamAction, err);
    throw err;
  }
}
