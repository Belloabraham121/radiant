import { z } from "zod";
import { chainIdSchema } from "../chains/types.js";
import type { BalanceResult, ChainId, TxResult } from "../chains/types.js";
import type { WalletAssetsData } from "../wallet/wallet-assets.types.js";
import type {
  DeepBookManagerBalancesResult,
  DeepBookManagerInfo,
} from "../defi/deepbook-balance-manager.types.js";
import type {
  DeepBookPoolInfo,
  DeepBookPoolsList,
  DeepBookTickerMap,
} from "../defi/deepbook-pools.service.js";
import type { DeepBookSwapQuoteResult } from "../defi/deepbook-swap.service.js";
import type { DeepBookOpenOrdersResult } from "../defi/deepbook-orders.service.js";

export const chatRequestSchema = z.object({
  message: z.string().min(1).max(8000),
  session_id: z.string().uuid().optional(),
  approve_transaction_id: z.string().uuid().optional(),
  clarification_id: z.string().uuid().optional(),
  clarification_response: z.enum(["yes", "no"]).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type PendingClarification = {
  id: string;
  question: string;
  step_index?: number;
  kind: "intent" | "amount_ref" | "constraint_skip";
  plan_preview?: string;
};

export type ToolCallRecord = {
  name: string;
  result: unknown;
};

export type PendingTransaction = {
  id: string;
  chain_id: ChainId;
  action: string;
  params: Record<string, unknown>;
  summary: string;
  amount_display: string;
};

export type ChatResponse = {
  reply: string;
  session_id: string;
  mode: "openai" | "stub";
  tool_calls: ToolCallRecord[];
  pending_transaction: PendingTransaction | null;
  pending_clarification: PendingClarification | null;
  message_id: string;
};

export const queryChainInputSchema = z.object({
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
    "deepbook_open_orders",
  ]),
  params: z
    .object({
      evm_chain_id: z.number().int().positive().optional(),
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
    })
    .passthrough()
    .optional()
    .default({}),
});

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
  | DeepBookOpenOrdersResult;

export type ExecuteToolOutcome =
  | { status: "executed"; result: TxResult }
  | { status: "approval_required"; pending: PendingTransaction };
