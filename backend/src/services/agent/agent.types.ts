import type { TransactionFiatPreview } from "../market/valuation.types.js";
import { z } from "zod";
import { chainIdSchema } from "../chains/types.js";
import type { BalanceResult, ChainId, TxResult } from "../chains/types.js";
import type { WalletAssetsData } from "../wallet/wallet-assets.types.js";
import type {
  DeepBookManagerBalancesResult,
  DeepBookManagerInfo,
} from "../defi/deepbook/deepbook-balance-manager.types.js";
import type {
  DeepBookPoolInfo,
  DeepBookPoolsList,
  DeepBookTickerMap,
} from "../defi/deepbook/deepbook-pools.service.js";
import type { DeepBookSwapQuoteResult } from "../defi/deepbook/deepbook-swap.service.js";
import type { FlashLoanBundleQuoteResult } from "../defi/deepbook/deepbook-flash-loan.types.js";
import type { DeepBookOpenOrdersResult } from "../defi/deepbook/deepbook-orders.service.js";
import type {
  DeepBookStakeBalanceResult,
  DeepBookStakeRequiredResult,
} from "../defi/deepbook/deepbook-stake.service.js";
import type { DeepBookGovernanceStateResult } from "../defi/deepbook/deepbook-governance.service.js";
import type {
  DeepBookOhlcvResult,
  DeepBookTradesResult,
  DeepBookVolumeResult,
} from "../defi/deepbook/deepbook-indexer-analytics.service.js";
import type { AgentTransactionsQueryResult } from "../agent-transaction/agent-transaction.types.js";
import type { ProjectActionsCatalogResponse } from "../projects/app-action-schema.types.js";
import type { ProjectNotificationSchema } from "../notifications/notification-schema.types.js";
import type { ArtifactPayload } from "../projects/project.types.js";
import {
  agentTransactionCategorySchema,
  agentTransactionStatusSchema,
} from "../agent-transaction/agent-transaction.types.js";
import { pinnedAppScopeSchema } from "../projects/pinned-app-scope.types.js";

export const chatRequestSchema = z
  .object({
    message: z.string().max(8000).optional().default(""),
    session_id: z.string().uuid().optional(),
    app_scope: pinnedAppScopeSchema.optional(),
    approve_transaction_id: z.string().uuid().optional(),
    reject_transaction_id: z.string().uuid().optional(),
    clarification_id: z.string().uuid().optional(),
    /** @deprecated use clarification_confirm */
    clarification_response: z.enum(["yes", "no"]).optional(),
    clarification_confirm: z.enum(["yes", "no"]).optional(),
    clarification_value: z.union([z.string(), z.number()]).optional(),
    clarification_option_id: z.string().optional(),
    clarification_option_ids: z.array(z.string()).optional(),
  })
  .refine(
    (body) =>
      Boolean(body.message?.trim()) ||
      Boolean(body.approve_transaction_id) ||
      Boolean(body.reject_transaction_id) ||
      Boolean(body.clarification_id),
    { message: "message, approve_transaction_id, reject_transaction_id, or clarification_id is required" },
  );

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type ClarificationInteractionType =
  | "confirm"
  | "input"
  | "single_choice"
  | "multi_choice";

export type ClarificationOption = {
  id: string;
  label: string;
};

export type ClarificationSuggestion = {
  label: string;
  value: string | number;
};

export type PendingClarification = {
  id: string;
  gap_id: string;
  interaction_type: ClarificationInteractionType;
  question: string;
  step_index: number;
  field?: string;
  kind: "intent" | "amount_ref" | "constraint_skip";
  input_kind?: "number" | "text";
  placeholder?: string;
  hint?: string;
  options?: ClarificationOption[];
  suggestions?: ClarificationSuggestion[];
  plan_preview?: string;
};

export type ToolCallRecord = {
  name: string;
  /** Present for query_chain — which read-only query was invoked. */
  query?: string;
  /** Present for execute_transaction — which on-chain action was invoked. */
  action?: string;
  result: unknown;
};

export type { TransactionFiatPreview } from "../market/valuation.types.js";

export type PendingTransaction = {
  id: string;
  chain_id: ChainId;
  action: string;
  params: Record<string, unknown>;
  summary: string;
  amount_display: string;
  /** ISO timestamp — swap quotes expire; approval is blocked after this time. */
  quote_expires_at?: string | null;
  /** USD estimates for approval UI (pay / receive / net). */
  fiat_preview?: TransactionFiatPreview | null;
};

export type ChatResponse = {
  reply: string;
  session_id: string;
  mode: "openai" | "stub";
  tool_calls: ToolCallRecord[];
  pending_transaction: PendingTransaction | null;
  pending_clarification: PendingClarification | null;
  message_id: string;
  /** Set when generate_app succeeds — opens artifact panel on client (Phase 1). */
  artifact: ArtifactPayload | null;
};

const queryChainInputObjectSchema = z.object({
  chain_id: chainIdSchema,
  query: z.enum([
    "balance",
    "native_balance",
    "token_balances",
    "deepbook_manager_info",
    "deepbook_manager_balance",
    "deepbook_pools",
    "deepbook_pool_info",
    "deepbook_ticker",
    "swap_quote",
    "flash_loan_quote",
    "deepbook_open_orders",
    "deepbook_stake_balance",
    "deepbook_stake_required",
    "deepbook_governance_state",
    "deepbook_trades",
    "deepbook_volume",
    "deepbook_ohlcv",
    "agent_transactions",
    "project_actions",
    "session_actions",
    "project_notification_schema",
    "margin_pool_info",
    "margin_manager_info",
    "margin_tpsl_info",
    "margin_open_orders",
    "margin_liquidations",
    "margin_collateral_history",
    "margin_loan_history",
    "margin_at_risk_states",
    "margin_managers_info",
    "margin_manager_created",
    "margin_supply_history",
    "margin_indexer_supply",
    "margin_manager_state",
    "predict_markets",
    "predict_trade_amounts",
    "predict_range_amounts",
    "predict_manager_info",
    "predict_vault_summary",
    "token_resolve",
    "supported_chains",
  ]),
  params: z
    .object({
      evm_chain_id: z.number().int().positive().optional(),
      to_chain_id: chainIdSchema.optional(),
      to_evm_chain_id: z.number().int().positive().optional(),
      symbol: z.string().min(1).optional(),
      token: z.string().min(1).optional(),
      input: z.string().min(1).optional(),
      include_zero: z.boolean().optional(),
      include_usd: z.boolean().optional(),
      coin_key: z.string().min(1).optional(),
      coin_keys: z.array(z.string().min(1)).optional(),
      pool_key: z.string().min(1).optional(),
      amount: z.number().positive().optional(),
      amount_display: z.number().positive().optional(),
      side: z.enum(["buy", "sell"]).optional(),
      pay_with_deep: z.boolean().optional(),
      slippage_bps: z.number().int().min(0).max(5000).optional(),
      min_out_display: z.number().positive().optional(),
      borrow_amount: z.number().positive().optional(),
      asset: z.enum(["base", "quote"]).optional(),
      strategy: z.enum(["round_trip", "swap_chain_repay"]).optional(),
      steps: z
        .array(
          z.object({
            pool_key: z.string().min(1),
            side: z.enum(["buy", "sell"]),
            amount: z.number().positive(),
            pay_with_deep: z.boolean().optional(),
            min_out_display: z.number().positive().optional(),
          }),
        )
        .optional(),
      repay_source: z.enum(["swap_output", "wallet", "merged"]).optional(),
      estimated_surplus: z.number().optional(),
      limit: z.number().int().positive().max(500).optional(),
      status: agentTransactionStatusSchema.optional(),
      category: agentTransactionCategorySchema.optional(),
      session_id: z.string().uuid().optional(),
      transaction_id: z.string().uuid().optional(),
      project_id: z.string().uuid().optional(),
      app_name: z.string().min(1).optional(),
    })
    .passthrough()
    .optional()
    .default({}),
});

function coercePositiveNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(/,/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

export const queryChainInputSchema = z.preprocess((input) => {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  const record = input as Record<string, unknown>;
  const params =
    typeof record.params === "object" && record.params !== null
      ? { ...(record.params as Record<string, unknown>) }
      : {};

  const amount = coercePositiveNumber(params.amount);
  if (amount != null) {
    params.amount = amount;
  }
  const amountDisplay = coercePositiveNumber(params.amount_display);
  if (amountDisplay != null) {
    params.amount_display = amountDisplay;
  }
  const borrowAmount = coercePositiveNumber(params.borrow_amount);
  if (borrowAmount != null) {
    params.borrow_amount = borrowAmount;
  }
  const limit = coercePositiveNumber(params.limit);
  if (limit != null) {
    params.limit = limit;
  }

  const queryLimitMax: Partial<Record<string, number>> = {
    agent_transactions: 10,
    deepbook_trades: 200,
    margin_liquidations: 200,
    margin_collateral_history: 200,
    margin_loan_history: 200,
    margin_at_risk_states: 200,
    margin_manager_created: 200,
    margin_supply_history: 200,
    deepbook_ohlcv: 500,
    deepbook_volume: 365,
  };
  if (typeof record.query === "string" && typeof params.limit === "number") {
    const cap = queryLimitMax[record.query];
    if (cap != null) {
      params.limit = Math.min(cap, Math.trunc(params.limit));
    }
  }

  if (record.query === "flash_loan_quote") {
    if (params.borrow_amount == null && typeof params.amount === "number" && params.amount > 0) {
      params.borrow_amount = params.amount;
    }
    delete params.amount;
  }

  const projectId = params.project_id;
  if (typeof projectId === "string" && projectId.trim()) {
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(projectId.trim())) {
      if (typeof params.app_name !== "string" || !params.app_name.trim()) {
        params.app_name = projectId.trim();
      }
      delete params.project_id;
    }
  }

  return { ...record, params };
}, queryChainInputObjectSchema);

export type QueryChainInput = z.infer<typeof queryChainInputSchema>;

export type QueryChainResult =
  | BalanceResult
  | WalletAssetsData
  | DeepBookManagerInfo
  | DeepBookManagerBalancesResult
  | DeepBookPoolsList
  | DeepBookPoolInfo
  | DeepBookTickerMap
  | DeepBookSwapQuoteResult
  | FlashLoanBundleQuoteResult
  | DeepBookOpenOrdersResult
  | DeepBookStakeBalanceResult
  | DeepBookStakeRequiredResult
  | DeepBookGovernanceStateResult
  | DeepBookTradesResult
  | DeepBookVolumeResult
  | DeepBookOhlcvResult
  | AgentTransactionsQueryResult
  | ProjectActionsCatalogResponse
  | ProjectNotificationSchema
  | { schema: ProjectNotificationSchema | null }
  | Record<string, unknown>;

export type ExecuteToolOutcome =
  | { status: "executed"; result: TxResult; agent_transaction_id?: string }
  | { status: "approval_required"; pending: PendingTransaction; agent_transaction_id?: string };
