import { z } from "zod";
import type { Route, StatusResponse } from "@lifi/types";
import { chainIdSchema, type ChainId } from "../../chains/types.js";
import type { RouteQuote } from "../types.js";
import {
  formatEnabledBridgeDestinationHint,
  isUnrecognizedDestinationLabel,
  isUnrecognizedSourceLabel,
  normalizeLifiCrossChainParams,
} from "./lifi-endpoint-params.js";

const evmChainIdSchema = z.coerce.number().int().positive();
function normalizeLifiTokenParam(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  // Li-Fi composite token id e.g. "8453-0x833589..."
  const compositeDash = trimmed.indexOf("-0x");
  if (compositeDash > 0) {
    const addressPart = trimmed.slice(compositeDash + 1);
    if (addressPart.length === 42 && addressPart.slice(0, 2).toLowerCase() === "0x") {
      return addressPart;
    }
  }
  if (trimmed.length === 42 && trimmed.slice(0, 2).toLowerCase() === "0x") {
    return trimmed;
  }
  return trimmed.toUpperCase();
}

const optionalTokenSymbolSchema = z
  .string()
  .optional()
  .transform((value) => normalizeLifiTokenParam(value));
const optionalAmountAtomicSchema = z.string().optional();

const lifiRadiantChainIdSchema = z.enum(["sui", "solana", "ethereum"]);

const lifiChainEndpointSchema = z
  .object({
    chain_id: lifiRadiantChainIdSchema.optional(),
    evm_chain_id: evmChainIdSchema.optional(),
    /** @deprecated Prefer chain_id + evm_chain_id */
    from_evm_chain_id: evmChainIdSchema.optional(),
    /** @deprecated Prefer chain_id + evm_chain_id */
    to_evm_chain_id: evmChainIdSchema.optional(),
  })
  .passthrough();

function resolveEndpointChainId(
  input: z.infer<typeof lifiChainEndpointSchema>,
  prefix: "from" | "to",
): { chain_id?: ChainId; evm_chain_id?: number } {
  const chainId = (input[`${prefix}_chain_id`] ?? input.chain_id) as ChainId | undefined;
  const evmChainId = input[`${prefix}_evm_chain_id`] ?? input.evm_chain_id;

  if (chainId === undefined && evmChainId !== undefined) {
    return { chain_id: "ethereum", evm_chain_id: evmChainId };
  }

  return { chain_id: chainId, evm_chain_id: evmChainId };
}

const lifiCrossChainBaseSchema = z
  .object({
    from_chain_id: lifiRadiantChainIdSchema.optional(),
    to_chain_id: lifiRadiantChainIdSchema.optional(),
    from_evm_chain_id: evmChainIdSchema.optional(),
    to_evm_chain_id: evmChainIdSchema.optional(),
    /** Human-readable EVM destination slug (e.g. base, arbitrum) — resolved to to_evm_chain_id. */
    destination_evm: z.string().min(1).optional(),
    to_network: z.string().min(1).optional(),
    from_token: optionalTokenSymbolSchema,
    to_token: optionalTokenSymbolSchema,
    amount_atomic: optionalAmountAtomicSchema,
    from_address: z.string().min(1).optional(),
    slippage: z.number().min(0).max(1).optional(),
    integrator: z.string().optional(),
    /** Set true only when the user explicitly asked to receive the same symbol on the destination chain. */
    confirm_same_token: z.boolean().optional(),
  })
  .superRefine((input, ctx) => {
    const from = resolveEndpointChainId(input, "from");
    const to = resolveEndpointChainId(input, "to");

    if (isUnrecognizedSourceLabel(input)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Source network is not recognized. ${formatEnabledBridgeDestinationHint()}`,
        path: ["from_network"],
      });
    }
    if (isUnrecognizedDestinationLabel(input)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Destination network is not recognized. ${formatEnabledBridgeDestinationHint()}`,
        path: ["destination_evm"],
      });
    }

    if (from.chain_id === "ethereum" && from.evm_chain_id === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Source EVM network is required. ${formatEnabledBridgeDestinationHint()}`,
        path: ["from_evm_chain_id"],
      });
    }
    if (to.chain_id === "ethereum" && to.evm_chain_id === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Destination EVM network is required. ${formatEnabledBridgeDestinationHint()}`,
        path: ["to_evm_chain_id"],
      });
    }
  });

export const lifiQuoteInputSchema = z.preprocess(
  normalizeLifiCrossChainParams,
  lifiCrossChainBaseSchema,
);
export type LifiQuoteInput = z.infer<typeof lifiQuoteInputSchema>;

export const lifiRoutesInputSchema = z.preprocess(
  normalizeLifiCrossChainParams,
  lifiCrossChainBaseSchema.and(
    z.object({
      max_routes: z.coerce.number().int().min(1).max(10).optional(),
    }),
  ),
);
export type LifiRoutesInput = z.infer<typeof lifiRoutesInputSchema>;

export const lifiConnectionsInputSchema = z.object({
  from_chain_id: lifiRadiantChainIdSchema.optional(),
  to_chain_id: lifiRadiantChainIdSchema.optional(),
  from_evm_chain_id: evmChainIdSchema.optional(),
  to_evm_chain_id: evmChainIdSchema.optional(),
});
export type LifiConnectionsInput = z.infer<typeof lifiConnectionsInputSchema>;

export const lifiStatusInputSchema = z.object({
  tx_hash: z.string().min(8),
  from_chain_id: lifiRadiantChainIdSchema.optional(),
  to_chain_id: lifiRadiantChainIdSchema.optional(),
  from_evm_chain_id: evmChainIdSchema.optional(),
  to_evm_chain_id: evmChainIdSchema.optional(),
  bridge: z.string().min(1).optional(),
});
export type LifiStatusInput = z.infer<typeof lifiStatusInputSchema>;

export const lifiExecuteInputSchema = z.object({
  route_id: z.string().min(1).optional(),
  route: z.record(z.unknown()).optional(),
  lifi_route: z.record(z.unknown()).optional(),
  from_chain_id: chainIdSchema.optional(),
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
  from_chain_id: ChainId;
  to_chain_id: ChainId;
  from_lifi_chain_id: number;
  to_lifi_chain_id: number;
  /** Present when source or dest is EVM. */
  from_evm_chain_id?: number;
  to_evm_chain_id?: number;
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
  from_chain_id: ChainId;
  to_chain_id: ChainId;
  from_lifi_chain_id: number;
  to_lifi_chain_id: number;
  from_evm_chain_id?: number;
  to_evm_chain_id?: number;
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
  expires_at: string;
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
  from_chain_id: ChainId;
  to_chain_id: ChainId;
  from_lifi_chain_id: number;
  to_lifi_chain_id: number;
  from_evm_chain_id?: number;
  to_evm_chain_id?: number;
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

export { lifiChainEndpointSchema, resolveEndpointChainId };
