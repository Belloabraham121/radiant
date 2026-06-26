import { z } from "zod";
import type { Squid } from "@0xsquid/sdk";
import type { StatusResponse } from "@0xsquid/sdk/dist/types/index.js";
import { chainIdSchema, type ChainId } from "../../chains/types.js";

const evmChainIdSchema = z.coerce.number().int().positive();

const squidRadiantChainIdSchema = z.enum(["sui", "solana", "ethereum", "stellar"]);

const squidCrossChainBaseSchema = z.object({
  from_chain_id: squidRadiantChainIdSchema.optional(),
  to_chain_id: squidRadiantChainIdSchema.optional(),
  from_evm_chain_id: evmChainIdSchema.optional(),
  to_evm_chain_id: evmChainIdSchema.optional(),
  from_token: z.string().optional(),
  to_token: z.string().optional(),
  amount_atomic: z.string().optional(),
  from_address: z.string().min(1).optional(),
  to_address: z.string().min(1).optional(),
  slippage: z.number().min(0).max(1).optional(),
  confirm_same_token: z.boolean().optional(),
  quote_only: z.boolean().optional(),
});

export const squidQuoteInputSchema = squidCrossChainBaseSchema;
export type SquidQuoteInput = z.infer<typeof squidQuoteInputSchema>;

export const squidRoutesInputSchema = squidCrossChainBaseSchema.and(
  z.object({
    max_routes: z.coerce.number().int().min(1).max(10).optional(),
  }),
);
export type SquidRoutesInput = z.infer<typeof squidRoutesInputSchema>;

export type SquidRouteResponse = Awaited<ReturnType<Squid["getRoute"]>>;
export type SquidRouteRequest = Parameters<Squid["getRoute"]>[0];
export type SquidRouteSnapshot = SquidRouteResponse["route"];

export type SquidStoredRoutePayload = {
  route: SquidRouteSnapshot;
  quote_id: string;
  request_id?: string;
  integrator_id?: string;
  from_chain_id: ChainId;
  to_chain_id: ChainId;
  from_evm_chain_id?: number;
  to_evm_chain_id?: number;
  from_squid_chain_id: string;
  to_squid_chain_id: string;
};

/** Zod schema for Squid chain catalog entries (SDK subset). */
export const squidChainSchema = z.object({
  chainId: z.union([z.string(), z.number()]),
  networkName: z.string().optional(),
  chainName: z.string().optional(),
  chainType: z.string().optional(),
});

export type SquidChainSummary = {
  id: string;
  name: string;
  chain_type: string;
};

export const squidTokenSchema = z.object({
  address: z.string(),
  symbol: z.string(),
  decimals: z.number(),
  chainId: z.union([z.string(), z.number()]),
});

export type SquidTokenEntry = z.infer<typeof squidTokenSchema>;

export const squidStatusInputSchema = z.object({
  transaction_id: z.string().min(8),
  quote_id: z.string().min(1),
  from_chain_id: squidRadiantChainIdSchema.optional(),
  to_chain_id: squidRadiantChainIdSchema.optional(),
  from_evm_chain_id: evmChainIdSchema.optional(),
  to_evm_chain_id: evmChainIdSchema.optional(),
  request_id: z.string().min(1).optional(),
  bridge_type: z.string().min(1).optional(),
});
export type SquidStatusInput = z.infer<typeof squidStatusInputSchema>;

export const squidExecuteInputSchema = z
  .object({
    route_id: z.string().min(1).optional(),
    squid_route: z.record(z.unknown()).optional(),
    from_chain_id: chainIdSchema.optional(),
    from_evm_chain_id: evmChainIdSchema.optional(),
    to_chain_id: chainIdSchema.optional(),
    to_evm_chain_id: evmChainIdSchema.optional(),
    skip_approval: z.boolean().optional(),
    expires_at: z.string().min(1).optional(),
    quote_expires_at: z.string().min(1).optional(),
  })
  .passthrough();
export type SquidExecuteInput = z.infer<typeof squidExecuteInputSchema>;

export type SquidNormalizedStatus =
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "NEEDS_GAS"
  | "PENDING"
  | "FAILED"
  | "NOT_FOUND"
  | "UNKNOWN";

export type SquidCrossChainStatusResult = {
  status: SquidNormalizedStatus;
  substatus: string | null;
  substatus_message: string | null;
  transaction_id: string;
  quote_id: string;
  from_chain_id: ChainId;
  to_chain_id: ChainId;
  from_evm_chain_id?: number;
  to_evm_chain_id?: number;
  receiving_tx_hash: string | null;
  raw: StatusResponse;
};

export type SquidExecuteResult = {
  route_id: string;
  quote_id: string;
  request_id: string | null;
  tx_hashes: string[];
  effects_status: "success" | "failure" | "pending" | "unknown";
  approval_tx_hash: string | null;
  bridge_started_at: string | null;
  estimated_duration_seconds: number | null;
};

export type SquidApprovalResult = {
  required: boolean;
  spender: string | null;
  token: string | null;
  tx_hash: string | null;
  effects_status: "success" | "failure" | "unknown" | "skipped";
};

export type SquidExecuteRouteRequest = Parameters<Squid["executeRoute"]>[0];
export type SquidExecuteRouteResponse = Awaited<ReturnType<Squid["executeRoute"]>>;
export type SquidGetStatusRequest = Parameters<Squid["getStatus"]>[0];
