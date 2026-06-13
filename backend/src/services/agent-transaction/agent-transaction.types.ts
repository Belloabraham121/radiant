import type { ChainId, ExecuteTransactionInput, TxResult } from "../chains/types.js";
import { chainIdSchema } from "../chains/types.js";
import { z } from "zod";
import type { PendingTransaction } from "../agent/agent.types.js";

/** Mirrors `AgentTransactionStatus` in `schema.prisma` — defined locally so app code does not depend on a generated Prisma client. */
export type AgentTransactionStatus =
  | "pending_approval"
  | "rejected"
  | "expired"
  | "submitted"
  | "success"
  | "failure";

/** Mirrors `AgentTransactionCategory` in `schema.prisma`. */
export type AgentTransactionCategory =
  | "swap"
  | "transfer"
  | "deepbook_balance"
  | "deepbook_order"
  | "deepbook_cancel"
  | "deepbook_modify"
  | "deepbook_settled"
  | "flash_loan"
  | "other";

/** Row shape returned from the agent transaction repository. */
export type AgentTransactionRecord = {
  id: string;
  user_id: bigint;
  session_id: string | null;
  message_id: string | null;
  workflow_step_index: number | null;
  chain_id: string;
  wallet_address: string;
  action: string;
  params: unknown;
  category: AgentTransactionCategory;
  title: string;
  amount_display: string;
  status: AgentTransactionStatus;
  digest: string | null;
  effects_status: string | null;
  result: unknown;
  error_code: string | null;
  error_message: string | null;
  created_at: Date;
  submitted_at: Date | null;
  completed_at: Date | null;
};

export type AgentTransactionListItem = {
  id: string;
  status: AgentTransactionStatus;
  category: AgentTransactionCategory;
  chain_id: ChainId;
  title: string;
  amount_display: string;
  digest: string | null;
  effects_status: string | null;
  session_id: string | null;
  message_id: string | null;
  created_at: string;
  completed_at: string | null;
};

export type AgentTransactionDetail = AgentTransactionListItem & {
  action: string;
  params: Record<string, unknown>;
  wallet_address: string;
  workflow_step_index: number | null;
  result: TxResult | null;
  error_code: string | null;
  error_message: string | null;
  submitted_at: string | null;
  explorer_url: string | null;
};

export type ListAgentTransactionsQuery = {
  page?: number;
  limit?: number;
  status?: AgentTransactionStatus;
  category?: AgentTransactionCategory;
  chain_id?: ChainId;
  session_id?: string;
};

export const agentTransactionStatusSchema = z.enum([
  "pending_approval",
  "rejected",
  "expired",
  "submitted",
  "success",
  "failure",
]);

export const agentTransactionCategorySchema = z.enum([
  "swap",
  "transfer",
  "deepbook_balance",
  "deepbook_order",
  "deepbook_cancel",
  "deepbook_modify",
  "deepbook_settled",
  "flash_loan",
  "other",
]);

export const listAgentTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: agentTransactionStatusSchema.optional(),
  category: agentTransactionCategorySchema.optional(),
  chain_id: chainIdSchema.optional(),
  session_id: z.string().uuid().optional(),
});

export type ListAgentTransactionsQueryParsed = z.infer<typeof listAgentTransactionsQuerySchema>;

export type PaginatedAgentTransactions = {
  items: AgentTransactionListItem[];
  page: number;
  limit: number;
  total: number;
};

/** Result shape for `query_chain` → `agent_transactions` (capped list for agent context). */
export type AgentTransactionsQueryResult = {
  items: Array<AgentTransactionListItem | AgentTransactionDetail>;
  total: number;
  limit: number;
};

export type QueryAgentTransactionsInput = {
  chainId?: ChainId;
  limit?: number;
  status?: AgentTransactionStatus;
  category?: AgentTransactionCategory;
  sessionId?: string;
  transactionId?: string;
};

export type RecordPendingApprovalInput = {
  privyUserId: string;
  sessionId?: string;
  messageId?: string;
  workflowStepIndex?: number;
  input: ExecuteTransactionInput;
  pending: PendingTransaction;
};

export type RecordAutoExecutedInput = {
  privyUserId: string;
  sessionId?: string;
  messageId?: string;
  workflowStepIndex?: number;
  input: ExecuteTransactionInput;
  transactionId?: string;
};

export type TransactionCompletion =
  | { kind: "success"; result: TxResult }
  | { kind: "failure"; error: { code: string; message: string } };

export type AttachMessageInput = {
  transactionId: string;
  messageId: string;
};
