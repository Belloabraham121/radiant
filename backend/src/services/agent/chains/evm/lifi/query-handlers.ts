import { z } from "zod";
import { AppError } from "../../../../../errors/app-error.js";
import { isLifiEnabled } from "../../../../../config/lifi.js";
import type { ChainId } from "../../../../chains/types.js";
import type { ChainQueryHandler, QueryHandlerContext } from "../../types.js";
import { getLifiConnections } from "../../../../defi/lifi/lifi-connections.service.js";
import { getLifiQuote } from "../../../../defi/lifi/lifi-quote.service.js";
import { getLifiAdvancedRoutes } from "../../../../defi/lifi/lifi-routes.service.js";
import { getLifiCrossChainStatus } from "../../../../defi/lifi/lifi-status.service.js";
import {
  lifiConnectionsInputSchema,
  lifiQuoteInputSchema,
  lifiRoutesInputSchema,
  lifiStatusInputSchema,
} from "../../../../defi/lifi/lifi.types.js";
import { formatEnabledBridgeDestinationHint } from "../../../../defi/lifi/lifi-endpoint-params.js";

const LIFI_AGENT_CHAINS = new Set<ChainId>(["ethereum", "sui", "solana"]);

function assertLifiChain(ctx: QueryHandlerContext): void {
  if (!LIFI_AGENT_CHAINS.has(ctx.chainId)) {
    throw new AppError(
      400,
      "UNSUPPORTED_QUERY",
      "Li-Fi queries require chain_id sui, solana, or ethereum.",
    );
  }
}

function assertLifiReady(): void {
  if (!isLifiEnabled()) {
    throw new AppError(503, "LIFI_UNAVAILABLE", "Li-Fi is not enabled on this deployment.");
  }
}

function mergeCrossChainParams(ctx: QueryHandlerContext) {
  return {
    ...ctx.params,
    from_chain_id: ctx.params.from_chain_id ?? ctx.chainId,
    from_address: ctx.params.from_address ?? ctx.walletAddress,
  };
}

const crossChainQuoteHandler: ChainQueryHandler = async (ctx) => {
  assertLifiChain(ctx);
  assertLifiReady();
  const params = lifiQuoteInputSchema.parse(mergeCrossChainParams(ctx));
  return getLifiQuote(ctx.privyUserId, params);
};

const crossChainRoutesHandler: ChainQueryHandler = async (ctx) => {
  assertLifiChain(ctx);
  assertLifiReady();
  const params = lifiRoutesInputSchema.parse(mergeCrossChainParams(ctx));
  return getLifiAdvancedRoutes(ctx.privyUserId, params);
};

const crossChainConnectionsHandler: ChainQueryHandler = async (ctx) => {
  assertLifiChain(ctx);
  assertLifiReady();
  const params = lifiConnectionsInputSchema.parse(ctx.params);
  return getLifiConnections(ctx.privyUserId, params);
};

const crossChainStatusHandler: ChainQueryHandler = async (ctx) => {
  assertLifiChain(ctx);
  assertLifiReady();

  const legacyBridgeId = ctx.params.bridge_id;
  const params = lifiStatusInputSchema.parse({
    tx_hash: ctx.params.tx_hash ?? ctx.params.txHash ?? legacyBridgeId,
    from_chain_id: ctx.params.from_chain_id ?? ctx.chainId,
    to_chain_id: ctx.params.to_chain_id,
    from_evm_chain_id: ctx.params.from_evm_chain_id,
    to_evm_chain_id: ctx.params.to_evm_chain_id,
    bridge: ctx.params.bridge ?? ctx.params.tool,
  });

  return getLifiCrossChainStatus(ctx.privyUserId, params);
};

export const LIFI_QUERY_TYPES = [
  "cross_chain_quote",
  "cross_chain_routes",
  "cross_chain_connections",
  "cross_chain_status",
] as const;

export const LIFI_QUERY_SCHEMA = {
  description:
    "cross_chain_quote (Li-Fi best route), cross_chain_routes (multi-bridge comparison), " +
    "cross_chain_connections, cross_chain_status.",
  paramsDescription:
    "cross_chain_quote: { from_chain_id?, to_chain_id?, from_evm_chain_id?, to_evm_chain_id?, destination_evm?, from_token, to_token, amount_atomic, from_address? }. " +
    "Defaults from_chain_id to query chain_id. When to_chain_id is ethereum you MUST set to_evm_chain_id or destination_evm. " +
    `Enabled bridge destinations: ${formatEnabledBridgeDestinationHint()}. ` +
    "Required before quote: from_token, to_token, amount_atomic — ask the user if any are missing. " +
    "For Sui→Base: from_chain_id sui, to_chain_id ethereum, to_evm_chain_id 8453 (or destination_evm base), from_token SUI, to_token USDC (ask if user did not specify destination token). " +
    "cross_chain_routes: same as cross_chain_quote plus optional max_routes. " +
    "cross_chain_connections: { from_chain_id?, to_chain_id?, from_evm_chain_id?, to_evm_chain_id? }. " +
    "cross_chain_status: { tx_hash, from_chain_id?, to_chain_id?, from_evm_chain_id?, to_evm_chain_id?, bridge? }.",
};

export const LIFI_QUERY_HANDLERS: Record<string, ChainQueryHandler> = {
  cross_chain_quote: crossChainQuoteHandler,
  cross_chain_routes: crossChainRoutesHandler,
  cross_chain_connections: crossChainConnectionsHandler,
  cross_chain_status: crossChainStatusHandler,
};

export function getLifiQueryHandler(query: string): ChainQueryHandler | null {
  return LIFI_QUERY_HANDLERS[query] ?? null;
}

export const lifiAgentParamsSchema = z.object({
  route_id: z.string().optional(),
  route: z.record(z.unknown()).optional(),
  expires_at: z.string().optional(),
  skip_approval: z.boolean().optional(),
});
