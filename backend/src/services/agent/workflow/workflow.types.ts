import type { ExecuteTransactionInput } from "../../chains/types.js";
import type { QueryChainInput } from "../agent.types.js";
import type { ToolCallRecord } from "../agent.types.js";
import type { TxResult } from "../../chains/types.js";
import type { StepDependency } from "../intent/step-dependency.js";
import type { ClarificationGap, PendingClarification } from "./clarification.types.js";
import type { WorkflowLedgerEntry } from "./workflow-ledger.js";

type WorkflowStepBase = {
  depends_on?: StepDependency;
};

export type WorkflowQueryStep = WorkflowStepBase & {
  kind: "query";
  label: string;
  input: QueryChainInput;
};

export type WorkflowExecuteStep = WorkflowStepBase & {
  kind: "execute";
  label: string;
  input: ExecuteTransactionInput;
};

export type WorkflowBuildStep = WorkflowStepBase & {
  kind: "build";
  label: string;
  instruction: string;
};

/** Fallback when planner cannot map a segment to a concrete tool input. */
export type WorkflowAgentStep = WorkflowStepBase & {
  kind: "agent";
  label: string;
  instruction: string;
};

export type WorkflowStep =
  | WorkflowQueryStep
  | WorkflowExecuteStep
  | WorkflowBuildStep
  | WorkflowAgentStep;

export type WorkflowPlan = {
  originalMessage: string;
  steps: WorkflowStep[];
};

export type CompletedWorkflowStep = {
  index: number;
  label: string;
  tool_calls: ToolCallRecord[];
  digest?: string;
  status?: "executed" | "skipped";
  skip_reason?: string;
};

export type SessionWorkflowStatus =
  | "active"
  | "paused_approval"
  | "paused_clarification"
  | "completed"
  | "failed";

export type SessionWorkflowState = {
  sessionId: string;
  plan: WorkflowPlan;
  currentStepIndex: number;
  completed: CompletedWorkflowStep[];
  ledger: WorkflowLedgerEntry[];
  status: SessionWorkflowStatus;
  pendingTransactionId?: string;
  pendingClarificationId?: string;
  failureMessage?: string;
  createdAt: number;
};

export type WorkflowStepOutcome =
  | {
      status: "executed";
      tool_calls: ToolCallRecord[];
      txResult?: TxResult;
    }
  | {
      status: "approval_required";
      tool_calls: ToolCallRecord[];
      pendingId: string;
    }
  | {
      status: "clarification_required";
      pending: PendingClarification;
    }
  | {
      status: "error";
      tool_calls: ToolCallRecord[];
      error: { code: string; message: string };
    };

export type WorkflowRunOutcome = {
  reply: string;
  tool_calls: ToolCallRecord[];
  pending_transaction: import("../agent.types.js").PendingTransaction | null;
  pending_clarification: PendingClarification | null;
  workflowCompleted: boolean;
};
