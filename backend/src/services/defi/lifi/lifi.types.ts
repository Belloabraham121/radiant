import { z } from "zod";
import type { Route, StatusResponse } from "@lifi/types";
import type { RouteQuote } from "../types.js";

const evmChainIdSchema = z.coerce.number().int().positive();
const tokenSymbolSchema = z.string().min(1).transform((value) => value.trim().toUpperCase());
const amountAtomicSchema = z.string().regex(/^[1-9]\d*$/);

export const lifiQuoteInputSchema = z.object({
  from_evm_chain_id: evmChainIdSchema,
  to_evm_chain_id: evmChainIdSchema,
  from_token: tokenSymbolSchema,
  to_token: tokenSymbolSchema,
  amount_atomic: amountAtomicSchema,
  from_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  slippage: z.number().min(0).max(1).optional(),
  integrator: z.string().optional(),
});

export type LifiQuoteInput = z.infer<typeof lifiQuoteInputSchema>;

export const lifiRoutesInputSchema = lifiQuoteInputSchema.extend({
  max_routes: z.coerce.number().int().min(1).max(10).optional(),
});

export type LifiRoutesInput = z.infer<typeof lifiRoutesInputSchema>;

export const lifiConnectionsInputSchema = z.object({
  from_evm_chain_id: evmChainIdSchema.optional(),
  to_evm_chain_id: evmChainIdSchema.optional(),
});

export type LifiConnectionsInput = z.infer<typeof lifiConnectionsInputSchema>;

export const lifiStatusInputSchema = z.object({
  tx_hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  from_evm_chain_id: evmChainIdSchema,
  to_evm_chain_id: evmChainIdSchema,
  bridge: z.string().min(1).optional(),
});

export type LifiStatusInput = z.infer<typeof lifiStatusInputSchema>;

export const lifiExecuteInputSchema = z.object({
  route_id: z.string().min(1).optional(),
  route: z.record(z.unknown()).optional(),
  from_evm_chain_id: evmChainIdSchema.optional(),
  skip_approval: z.boolean().optional(),
});

export type LifiExecuteInput = z.infer<typeof lifiExecuteInputSchema>;

export type LifiTransactionRequest = {
  chain_id: number;
  to: string;
  from: string;
  data: string;
  value: string;
  gas_limit?: string;
};

/** Radiant cross-chain quote — extends shared RouteQuote with execution metadata. */
export type CrossChainQuote = RouteQuote & {
  route_id: string;
  from_evm_chain_id: number;
  to_evm_chain_id: number;
  from_token_symbol: string;
  to_token_symbol: string;
  gas_cost_usd: number | null;
  fee_cost_usd: number | null;
  tool: string | null;
  transaction_request: LifiTransactionRequest | null;
  /** Serialized Li-Fi route for execute or multi-step flows. */
  lifi_route: Route | null;
};

export type CrossChainRouteOption = {
  route_id: string;
  provider_id: "evm-lifi";
  from_evm_chain_id: number;
  to_evm_chain_id: number;
  from_token_symbol: string;
  to_token_symbol: string;
  from_amount_atomic: string;
  to_amount_atomic: string;
  bridges: string[];
  exchanges: string[];
  estimated_duration_seconds: number | null;
  gas_cost_usd: number | null;
  fee_cost_usd: number | null;
  tags: string[];
  lifi_route: Route;
};

export type CrossChainRoutesResult = {
  routes: CrossChainRouteOption[];
  unavailable_routes: unknown;
};

export type CrossChainStatusResult = {
  status: StatusResponse["status"];
  substatus: StatusResponse["substatus"] | null;
  substatus_message: string | null;
  tx_hash: string;
  from_evm_chain_id: number;
  to_evm_chain_id: number;
  receiving_tx_hash: string | null;
  tool: string | null;
  raw: StatusResponse;
};

export type LifiExecuteResult = {
  route_id: string;
  tx_hashes: string[];
  effects_status: "success" | "failure" | "pending" | "unknown";
  pending_step: {
    step_index: number;
    chain_id: number;
    action: string;
    message: string;
  } | null;
  approval_tx_hash: string | null;
};

export type LifiApprovalResult = {
  required: boolean;
  spender: string | null;
  token: string | null;
  tx_hash: string | null;
  effects_status: "success" | "failure" | "unknown" | "skipped";
};

/** Zod schema for Li-Fi chain catalog entries (REST/SDK subset). */
export const lifiChainSchema = z.object({
  id: z.number(),
  key: z.string(),
  name: z.string(),
  chainType: z.string(),
});

export const lifiChainsResponseSchema = z.object({
  chains: z.array(lifiChainSchema),
});

export const lifiTokenSchema = z.object({
  chainId: z.number(),
  address: z.string(),
  symbol: z.string(),
  decimals: z.number(),
  name: z.string().optional(),
});

export const lifiTokensResponseSchema = z.object({
  tokens: z.record(z.string(), z.array(lifiTokenSchema)),
});

export const lifiToolsResponseSchema = z.object({
  bridges: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      supportedChains: z.array(z.number()).optional(),
    }),
  ),
  exchanges: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      supportedChains: z.array(z.number()).optional(),
    }),
  ),
});

export const lifiConnectionsResponseSchema = z.object({
  connections: z.array(
    z.object({
      fromChainId: z.number(),
      toChainId: z.number(),
      fromTokens: z.array(lifiTokenSchema),
      toTokens: z.array(lifiTokenSchema),
    }),
  ),
});
