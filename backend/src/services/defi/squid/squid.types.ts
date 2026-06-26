import { z } from "zod";
import type { Squid } from "@0xsquid/sdk";
import type { ChainId } from "../../chains/types.js";

const evmChainIdSchema = z.coerce.number().int().positive();

const squidRadiantChainIdSchema = z.enum(["sui", "solana", "ethereum"]);

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
