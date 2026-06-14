import { mapAgentToolError } from "../../utils/agent-tool-errors.js";
import type { ExecuteTransactionInput } from "../chains/types.js";
import type { ExecuteToolOutcome } from "./agent.types.js";
import { runExecuteTransactionTool } from "./execute-transaction.tool.js";
import {
  createPendingTransaction,
  transferRequiresApproval,
} from "./transaction-approval.service.js";
import {
  resolveExecuteTransactionOptions,
  type AgentToolOptions,
} from "./execute-transaction-context.js";
import { validateExecuteTransactionInput } from "./deepbook/validate-execute-transaction.js";
import {
  recordAutoExecuted,
  markCompleted,
} from "../agent-transaction/agent-transaction.service.js";
import {
  isDeepBookSwapAction,
  preflightDeepBookSwap,
} from "../defi/deepbook/deepbook-swap.service.js";
import {
  preflightDeepBookPlaceLimitOrder,
  preflightDeepBookPlaceMarketOrder,
  preflightDeepBookModifyOrder,
  preflightDeepBookWithdrawSettled,
  preflightDeepBookWithdrawSettledPermissionless,
} from "../defi/deepbook/deepbook-orders.service.js";
import { preflightDeepBookWithdraw } from "../defi/deepbook/deepbook-balance-manager.service.js";
import {
  isDeepBookFlashLoanAction,
  preflightDeepBookFlashLoan,
} from "../defi/deepbook/deepbook-flash-loan.service.js";

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
  if (executeWithApprovalHandlerForTests) {
    return executeWithApprovalHandlerForTests(privyUserId, input, options);
  }

  const opts = resolveExecuteTransactionOptions(options);
  const approved = opts.approved === true;
  const context = {
    sessionId: opts.sessionId,
    messageId: opts.messageId,
    workflowStepIndex: opts.workflowStepIndex,
  };

  validateExecuteTransactionInput(input);

  if (!approved) {
    const needsApproval = await transferRequiresApproval(privyUserId, input);
    if (needsApproval) {
      if (isDeepBookSwapAction(input.action)) {
        await preflightDeepBookSwap(privyUserId, input.params);
      }
      if (input.action === "deepbook_place_limit_order") {
        await preflightDeepBookPlaceLimitOrder(privyUserId, input.params);
      }
      if (input.action === "deepbook_place_market_order") {
        await preflightDeepBookPlaceMarketOrder(privyUserId, input.params);
      }
      if (input.action === "deepbook_modify_order") {
        await preflightDeepBookModifyOrder(privyUserId, input.params);
      }
      if (input.action === "deepbook_withdraw_settled_amounts") {
        await preflightDeepBookWithdrawSettled(privyUserId, input.params);
      }
      if (input.action === "deepbook_withdraw_settled_amounts_permissionless") {
        await preflightDeepBookWithdrawSettledPermissionless(privyUserId, input.params);
      }
      if (input.action === "deepbook_withdraw") {
        await preflightDeepBookWithdraw(privyUserId, input.params);
      }
      if (isDeepBookFlashLoanAction(input.action)) {
        await preflightDeepBookFlashLoan(privyUserId, input.params);
      }
      const pending = await createPendingTransaction(privyUserId, input, context);
      return {
        status: "approval_required",
        pending,
        agent_transaction_id: pending.id,
      };
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
    const result = await runExecuteTransactionTool(privyUserId, input);
    if (transactionId) {
      await markCompleted(transactionId, { kind: "success", result }).catch(() => undefined);
    }
    return {
      status: "executed",
      result,
      ...(transactionId ? { agent_transaction_id: transactionId } : {}),
    };
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
}
