import { z } from "zod";

export const soroswapTradeTypeSchema = z.enum(["EXACT_IN", "EXACT_OUT"]);
export type SoroswapTradeType = z.infer<typeof soroswapTradeTypeSchema>;

export const soroswapProtocolSchema = z.enum(["soroswap", "phoenix", "aqua", "sdex"]);
export type SoroswapProtocol = z.infer<typeof soroswapProtocolSchema>;

export const soroswapHealthResponseSchema = z
  .object({
    status: z.string().optional(),
    protocols: z.array(z.string()).optional(),
  })
  .passthrough();
export type SoroswapHealthResponse = z.infer<typeof soroswapHealthResponseSchema>;

export const soroswapTokenSchema = z
  .object({
    address: z.string(),
    symbol: z.string(),
    decimals: z.number(),
    name: z.string().optional(),
    type: z.string().optional(),
    issuer: z.string().optional(),
  })
  .passthrough();
export type SoroswapToken = z.infer<typeof soroswapTokenSchema>;

export const soroswapTokensResponseSchema = z.array(soroswapTokenSchema);

export const soroswapQuoteInputSchema = z.object({
  token_in: z.string().min(1),
  token_out: z.string().min(1),
  amount: z.string().min(1),
  trade_type: soroswapTradeTypeSchema.optional(),
  slippage: z.number().min(0).max(1).optional(),
  from_address: z.string().min(1).optional(),
  skip_cache: z.boolean().optional(),
});
export type SoroswapQuoteInput = z.infer<typeof soroswapQuoteInputSchema>;

export const soroswapQuoteRequestSchema = z.object({
  assetIn: z.string().min(1),
  assetOut: z.string().min(1),
  amount: z.string().min(1),
  tradeType: soroswapTradeTypeSchema,
  protocols: z.array(z.string()).optional(),
  slippageBps: z.number().int().nonnegative().optional(),
  from: z.string().optional(),
});
export type SoroswapQuoteRequest = z.infer<typeof soroswapQuoteRequestSchema>;

export const soroswapQuoteResponseSchema = z
  .object({
    assetIn: z.string().optional(),
    assetOut: z.string().optional(),
    amountIn: z.string().optional(),
    amountOut: z.string().optional(),
    tradeType: soroswapTradeTypeSchema.optional(),
    expiresAt: z.string().optional(),
    expires_at: z.string().optional(),
    priceImpactPct: z.union([z.number(), z.string()]).optional(),
    platform: z.string().optional(),
    routePlan: z.array(z.unknown()).optional(),
  })
  .passthrough();
export type SoroswapQuoteResponse = z.infer<typeof soroswapQuoteResponseSchema>;

export const soroswapBuildRequestSchema = z.object({
  quote: soroswapQuoteResponseSchema,
  from: z.string().min(1),
  to: z.string().optional(),
});
export type SoroswapBuildRequest = z.infer<typeof soroswapBuildRequestSchema>;

export const soroswapBuildResponseSchema = z
  .object({
    xdr: z.string(),
  })
  .passthrough();
export type SoroswapBuildResponse = z.infer<typeof soroswapBuildResponseSchema>;

export const soroswapSendRequestSchema = z.object({
  xdr: z.string().min(1),
});
export type SoroswapSendRequest = z.infer<typeof soroswapSendRequestSchema>;

export const soroswapSendResponseSchema = z
  .object({
    txHash: z.string().optional(),
    hash: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough();
export type SoroswapSendResponse = z.infer<typeof soroswapSendResponseSchema>;

export type SoroswapStoredQuotePayload = {
  quote: SoroswapQuoteResponse;
  quote_id: string;
  stored_at: string;
  expires_at: string | null;
  raw_request: SoroswapQuoteRequest;
};

export const soroswapExecuteInputSchema = z.object({
  quote_id: z.string().min(1).optional(),
  route_id: z.string().min(1).optional(),
  from_address: z.string().min(1).optional(),
  token_in: z.string().min(1).optional(),
  token_out: z.string().min(1).optional(),
  amount: z.string().min(1).optional(),
  trade_type: soroswapTradeTypeSchema.optional(),
  slippage: z.number().min(0).max(1).optional(),
});
export type SoroswapExecuteInput = z.infer<typeof soroswapExecuteInputSchema>;

export type SoroswapSwapTrackingStatus = "pending" | "success" | "failed";

export type SoroswapExecuteResult = {
  quote_id: string;
  route_id: string;
  tx_hash: string;
  ledger?: number;
  effects_status: "success" | "failure" | "pending" | "unknown";
  tracking_status?: SoroswapSwapTrackingStatus;
};

export type SoroswapSwapStatusResult = {
  tx_hash: string;
  status: SoroswapSwapTrackingStatus;
  ledger?: number;
  successful?: boolean;
};
