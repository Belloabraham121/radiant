import { getSquidConfig, isSquidEnabled, squidSlippageFromFraction } from "../../../config/squid.js";
import { resolveSquidChainRef, squidChainIdToRadiantChainRef, type SquidChainRef } from "../../../config/squid-chains.js";
import { AppError } from "../../../errors/app-error.js";
import type { ChainId } from "../../chains/types.js";
import type { CrossChainRouteOption } from "../cross-chain/cross-chain.types.js";
import { radiantToSquidChainId, toSquidTokenAddress } from "./squid-chain-map.js";
import { squidSdk } from "./squid.client.js";
import { getStoredSquidRoute, storeSquidRoute } from "./squid-cache.js";
import { resolveSquidTokens, type ResolvedSquidChainPair } from "./squid-input.js";
import { createSquidRouteId, isExecutableSquidRoute, normalizeSquidRouteOption } from "./squid-normalize.js";
import { consumeSquidQuoteQuota } from "./squid-rate-limit.js";
import type { SquidQuoteInput, SquidRouteSnapshot, SquidStoredRoutePayload } from "./squid.types.js";
import { resolveSquidWalletAddresses } from "./squid-wallet-addresses.js";
import { resolveSquidQuoteTokenAddress } from "./squid-token-resolve.service.js";

/** SDK quote + normalize + route store — testable without wallet resolution. */
export async function fetchSquidRouteQuote(input: {
  userId: string;
  tokens: ResolvedSquidChainPair;
  amountAtomic: string;
  fromAddress: string;
  toAddress: string;
  slippage?: number;
  quoteOnly?: boolean;
}): Promise<CrossChainRouteOption> {
  const config = getSquidConfig();
  const { tokens, amountAtomic, fromAddress, toAddress } = input;

  const routeSeed = JSON.stringify({
    from_chain_id: tokens.from.chain_id,
    to_chain_id: tokens.to.chain_id,
    from_evm_chain_id:
      tokens.from.chain_id === "ethereum" ? tokens.from.evm_chain_id : undefined,
    to_evm_chain_id: tokens.to.chain_id === "ethereum" ? tokens.to.evm_chain_id : undefined,
    from_token: tokens.fromSymbol,
    to_token: tokens.toSymbol,
    amount_atomic: amountAtomic,
    from_address: fromAddress,
    to_address: toAddress,
    slippage: input.slippage ?? config.defaultSlippage,
  });

  const squidFromChain = radiantToSquidChainId(tokens.from);
  const squidToChain = radiantToSquidChainId(tokens.to);
  const fromResolved = await resolveSquidQuoteTokenAddress({
    userId: input.userId,
    token: tokens.fromToken,
    chainRef: tokens.from,
  });
  const toResolved = await resolveSquidQuoteTokenAddress({
    userId: input.userId,
    token: tokens.toToken,
    chainRef: tokens.to,
  });
  const squidFromToken = fromResolved.address;
  const squidToToken = toResolved.address;

  let response: Awaited<ReturnType<typeof squidSdk.getRoute>>;
  try {
    response = await squidSdk.getRoute({
      fromChain: squidFromChain,
      toChain: squidToChain,
      fromToken: squidFromToken,
      toToken: squidToToken,
      fromAmount: amountAtomic,
      fromAddress,
      toAddress,
      slippage: squidSlippageFromFraction(input.slippage ?? config.defaultSlippage),
      quoteOnly: input.quoteOnly ?? true,
    });
  } catch (sdkErr) {
    throw sdkErr;
  }

  if (!response.route?.quoteId) {
    throw new AppError(404, "SQUID_NO_ROUTE", "No route found for this transfer.");
  }

  const routeId = createSquidRouteId(routeSeed);
  const normalized = normalizeSquidRouteOption({
    response,
    from: tokens.from,
    to: tokens.to,
    fromTokenSymbol: tokens.fromSymbol,
    toTokenSymbol: tokens.toSymbol,
    routeId,
  });

  const stored: SquidStoredRoutePayload = {
    route: response.route,
    quote_id: response.route.quoteId,
    request_id: response.requestId,
    integrator_id: response.integratorId,
    from_chain_id: tokens.from.chain_id,
    to_chain_id: tokens.to.chain_id,
    from_evm_chain_id:
      tokens.from.chain_id === "ethereum" ? tokens.from.evm_chain_id : undefined,
    to_evm_chain_id: tokens.to.chain_id === "ethereum" ? tokens.to.evm_chain_id : undefined,
    from_squid_chain_id: radiantToSquidChainId(tokens.from),
    to_squid_chain_id: radiantToSquidChainId(tokens.to),
  };
  await storeSquidRoute(routeId, stored);

  return normalized;
}

/** Single best Squid route via SDK `getRoute` — no quote dedupe cache. */
export async function getSquidRoute(
  privyUserId: string,
  input: SquidQuoteInput,
): Promise<CrossChainRouteOption> {
  if (!isSquidEnabled()) {
    throw new AppError(503, "SQUID_UNAVAILABLE", "Squid is not enabled on this deployment.");
  }

  await consumeSquidQuoteQuota(privyUserId);

  const tokens = resolveSquidTokens({
    from_chain_id: input.from_chain_id,
    to_chain_id: input.to_chain_id,
    from_evm_chain_id: input.from_evm_chain_id,
    to_evm_chain_id: input.to_evm_chain_id,
    fromToken: input.from_token ?? "",
    toToken: input.to_token ?? "",
    amountAtomic: input.amount_atomic,
    confirmSameToken: input.confirm_same_token,
  });

  const amountAtomic = input.amount_atomic;
  if (!amountAtomic) {
    throw new AppError(
      400,
      "AMOUNT_REQUIRED",
      "How much should they bridge? Ask for the amount before quoting.",
    );
  }

  const { fromAddress, toAddress } = await resolveSquidWalletAddresses(
    privyUserId,
    tokens.from,
    tokens.to,
    { fromAddress: input.from_address, toAddress: input.to_address },
  );

  return fetchSquidRouteQuote({
    userId: privyUserId,
    tokens,
    amountAtomic,
    fromAddress,
    toAddress,
    slippage: input.slippage,
    quoteOnly: input.quote_only,
  });
}

function readSnapshotEvmChainId(
  params: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = params[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return undefined;
}

function evmChainIdFromSquidRouteParam(chainId: unknown): number | undefined {
  if (chainId === undefined || chainId === null) {
    return undefined;
  }
  const ref = squidChainIdToRadiantChainRef(String(chainId));
  if (!ref || ref.chain_id !== "ethereum") {
    return undefined;
  }
  return ref.evm_chain_id;
}

function resolveStoredEvmChainIds(input: {
  snapshotParams: Record<string, unknown>;
  embeddedRoute: SquidRouteSnapshot;
  fromChainId: ChainId;
  toChainId: ChainId;
}): { from_evm_chain_id?: number; to_evm_chain_id?: number } {
  const fromEvmChainId =
    readSnapshotEvmChainId(input.snapshotParams, "from_evm_chain_id") ??
    (input.fromChainId === "ethereum"
      ? evmChainIdFromSquidRouteParam(input.embeddedRoute.params?.fromChain)
      : undefined);
  const toEvmChainId =
    readSnapshotEvmChainId(input.snapshotParams, "to_evm_chain_id") ??
    (input.toChainId === "ethereum"
      ? evmChainIdFromSquidRouteParam(input.embeddedRoute.params?.toChain)
      : undefined);
  return {
    ...(fromEvmChainId !== undefined ? { from_evm_chain_id: fromEvmChainId } : {}),
    ...(toEvmChainId !== undefined ? { to_evm_chain_id: toEvmChainId } : {}),
  };
}

export async function resolveSquidRouteForExecute(input: {
  routeId?: string;
  squidRoute?: Record<string, unknown>;
  privyUserId?: string;
  snapshotParams?: Record<string, unknown>;
}): Promise<SquidStoredRoutePayload> {
  const embedded = input.squidRoute;
  if (isExecutableSquidRoute(embedded)) {
    const snapshot = input.snapshotParams ?? {};
    const fromChainId = readSnapshotChainId(snapshot, "from_chain_id") ?? "ethereum";
    const toChainId = readSnapshotChainId(snapshot, "to_chain_id") ?? "ethereum";
    const evmIds = resolveStoredEvmChainIds({
      snapshotParams: snapshot,
      embeddedRoute: embedded,
      fromChainId,
      toChainId,
    });
    return {
      route: embedded,
      quote_id: embedded.quoteId,
      from_chain_id: fromChainId,
      to_chain_id: toChainId,
      ...evmIds,
      from_squid_chain_id: String(embedded.params?.fromChain ?? ""),
      to_squid_chain_id: String(embedded.params?.toChain ?? ""),
    };
  }

  if (input.routeId) {
    const stored = await getStoredSquidRoute(input.routeId);
    if (stored && isExecutableSquidRoute(stored.route)) {
      return stored;
    }

    if (input.privyUserId && input.snapshotParams) {
      let requoteError: unknown = null;
      const requoted = await requoteSquidFromSnapshot(input.privyUserId, input.snapshotParams, {
        onError: (err) => {
          requoteError = err;
        },
      });
      if (requoted) {
        const refreshed = await getStoredSquidRoute(requoted.route_id);
        if (refreshed && isExecutableSquidRoute(refreshed.route)) {
          return refreshed;
        }
      }
      if (requoteError instanceof AppError) {
        throw requoteError;
      }
    }

    throw new AppError(
      404,
      "SQUID_NO_ROUTE",
      "Bridge route expired. Fetch a fresh quote and try again.",
    );
  }

  throw new AppError(
    400,
    "SQUID_NO_ROUTE",
    "Bridge route data was incomplete. Fetch a fresh cross_chain_quote and pass its route_id before executing.",
  );
}

function readSnapshotString(params: Record<string, unknown>, key: string): string | null {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readSnapshotChainId(
  params: Record<string, unknown>,
  key: string,
): ChainId | undefined {
  const value = params[key];
  if (
    value === "sui" ||
    value === "solana" ||
    value === "ethereum" ||
    value === "stellar"
  ) {
    return value;
  }
  return undefined;
}

/** Re-fetch a Squid quote from execute/approval snapshot fields when route cache expired. */
export async function requoteSquidFromSnapshot(
  privyUserId: string,
  params: Record<string, unknown>,
  options?: { onError?: (err: unknown) => void },
): Promise<CrossChainRouteOption | null> {
  const fromToken =
    readSnapshotString(params, "from_token_symbol") ?? readSnapshotString(params, "from_token");
  const toToken =
    readSnapshotString(params, "to_token_symbol") ?? readSnapshotString(params, "to_token");
  const amountAtomic = readSnapshotString(params, "from_amount_atomic");
  const fromChainId = readSnapshotChainId(params, "from_chain_id");
  const toChainId = readSnapshotChainId(params, "to_chain_id");

  if (!fromToken || !toToken || !amountAtomic || !fromChainId || !toChainId) {
    return null;
  }

  const fromEvmChainId =
    typeof params.from_evm_chain_id === "number" ? params.from_evm_chain_id : undefined;
  const toEvmChainId =
    typeof params.to_evm_chain_id === "number" ? params.to_evm_chain_id : undefined;

  try {
    return await getSquidRoute(privyUserId, {
      from_chain_id: fromChainId,
      to_chain_id: toChainId,
      from_evm_chain_id: fromEvmChainId,
      to_evm_chain_id: toEvmChainId,
      from_token: fromToken,
      to_token: toToken,
      amount_atomic: amountAtomic,
      confirm_same_token:
        typeof params.confirm_same_token === "boolean" ? params.confirm_same_token : undefined,
      quote_only: false,
    });
  } catch (err) {
    options?.onError?.(err);
    return null;
  }
}

export function resolveSourceChainFromSquidExecuteInput(input: {
  from_chain_id?: ChainId;
  from_evm_chain_id?: number;
  stored?: SquidStoredRoutePayload;
}): SquidChainRef {
  const chainId = input.from_chain_id ?? input.stored?.from_chain_id;
  const evmChainId = input.from_evm_chain_id ?? input.stored?.from_evm_chain_id;

  if (chainId || evmChainId !== undefined) {
    return resolveSquidChainRef({
      chain_id: chainId,
      evm_chain_id: evmChainId,
    });
  }

  throw new AppError(
    400,
    "VALIDATION_ERROR",
    "Unable to determine source chain for Squid execute.",
  );
}

export function resolveDestinationChainFromSquidStored(stored: SquidStoredRoutePayload): SquidChainRef {
  return resolveSquidChainRef({
    chain_id: stored.to_chain_id,
    evm_chain_id: stored.to_evm_chain_id,
  });
}

export async function refreshSquidRouteAtExecute(input: {
  userId: string;
  stored: SquidStoredRoutePayload;
  tokens: ResolvedSquidChainPair;
  fromAddress: string;
  toAddress: string;
  slippage?: number;
}): Promise<SquidStoredRoutePayload> {
  const normalized = await fetchSquidRouteQuote({
    userId: input.userId,
    tokens: input.tokens,
    amountAtomic: input.stored.route.params?.fromAmount ?? input.stored.route.estimate?.fromAmount ?? "0",
    fromAddress: input.fromAddress,
    toAddress: input.toAddress,
    slippage: input.slippage,
    quoteOnly: false,
  });

  const refreshed = await getStoredSquidRoute(normalized.route_id);
  if (!refreshed) {
    throw new AppError(404, "SQUID_NO_ROUTE", "Failed to refresh Squid route at execute time.");
  }
  return refreshed;
}
