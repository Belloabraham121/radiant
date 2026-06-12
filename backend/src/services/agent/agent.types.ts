import { z } from "zod";
import { chainIdSchema } from "../chains/types.js";
import type { BalanceResult, ChainId, TxResult } from "../chains/types.js";
import type { WalletAssetsData } from "../wallet/wallet-assets.types.js";

export const chatRequestSchema = z.object({
  message: z.string().min(1).max(8000),
  session_id: z.string().uuid().optional(),
  approve_transaction_id: z.string().uuid().optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

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
  message_id: string;
};

export const queryChainInputSchema = z.object({
  chain_id: chainIdSchema,
  query: z.enum(["balance", "native_balance", "token_balances"]),
  params: z
    .object({
      evm_chain_id: z.number().int().positive().optional(),
      include_zero: z.boolean().optional(),
      include_usd: z.boolean().optional(),
    })
    .passthrough()
    .optional()
    .default({}),
});

export type QueryChainInput = z.infer<typeof queryChainInputSchema>;

export type QueryChainResult = BalanceResult | WalletAssetsData;

export type ExecuteToolOutcome =
  | { status: "executed"; result: TxResult }
  | { status: "approval_required"; pending: PendingTransaction };
