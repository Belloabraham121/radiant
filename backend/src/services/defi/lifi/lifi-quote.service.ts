import { getLifiConfig, isLifiEnabled, lifiIntegratorSdkFields } from "../../../config/lifi.js";
import { resolveLifiChainRef } from "../../../config/lifi-chains.js";
import { AppError } from "../../../errors/app-error.js";
import { resolveLifiBridgeWalletAddresses } from "./lifi-wallet-addresses.js";
import { convertQuoteToRoute } from "@lifi/sdk";
import type { Route } from "@lifi/types";
import type { ChainId } from "../../chains/types.js";
import {
  formatAtomicAmount,
  lifiToRadiantChainRef,
  radiantToLifiChainId,
  toLifiTokenAddress,
  type LifiChainRef,
} from "./lifi-chain-map.js";
import { lifiSdk } from "./lifi.client.js";
import { getStoredLifiRoute, lifiCachedQuoteFetch, storeLifiRoute } from "./lifi-cache.js";
import { resolveLifiTokens } from "./lifi-input.js";
import { consumeLifiQuoteQuota } from "./lifi-rate-limit.js";
import {
  createRouteId,
  isExecutableLifiRoute,
  normalizeLifiStepToCrossChainQuote,
} from "./lifi-normalize.js";
import type { CrossChainQuote, LifiQuoteInput } from "./lifi.types.js";

export async function getLifiQuote(
  privyUserId: string,
  input: LifiQuoteInput,
): Promise<CrossChainQuote> {
  if (!isLifiEnabled()) {
    throw new AppError(503, "LIFI_UNAVAILABLE", "Li-Fi is not enabled on this deployment.");
  }

  await consumeLifiQuoteQuota(privyUserId);

  const config = getLifiConfig();
  const tokens = resolveLifiTokens({
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
    throw new AppError(400, "AMOUNT_REQUIRED", "How much should they bridge? Ask for the amount before quoting.");
  }

  const { fromAddress, toAddress } = await resolveLifiBridgeWalletAddresses(
    privyUserId,
    tokens.from,
    tokens.to,
    { fromAddress: input.from_address },
  );
  const fromLifiChainId = radiantToLifiChainId(tokens.from);
  const toLifiChainId = radiantToLifiChainId(tokens.to);

  const cacheParams = {
    from_chain_id: tokens.from.chain_id,
    to_chain_id: tokens.to.chain_id,
    from_evm_chain_id:
      tokens.from.chain_id === "ethereum" ? tokens.from.evm_chain_id : undefined,
    to_evm_chain_id: tokens.to.chain_id === "ethereum" ? tokens.to.evm_chain_id : undefined,
    from_token: tokens.fromSymbol,
    to_token: tokens.toSymbol,
    amount_atomic: input.amount_atomic,
    from_address: fromAddress,
    to_address: toAddress,
    slippage: input.slippage ?? config.defaultSlippage,
    waive_integrator_fee: input.waive_integrator_fee ?? false,
  };

  return lifiCachedQuoteFetch(cacheParams, async () => {
    const fromTokenAddr = toLifiTokenAddress(tokens.fromToken, tokens.from);
    const toTokenAddr = toLifiTokenAddress(tokens.toToken, tokens.to);
    const step = await lifiSdk.getQuote({
      fromChain: fromLifiChainId,
      toChain: toLifiChainId,
      fromToken: fromTokenAddr,
      toToken: toTokenAddr,
      fromAddress,
      toAddress,
      fromAmount: amountAtomic,
      slippage: input.slippage ?? config.defaultSlippage,
      ...lifiIntegratorSdkFields(config, input.integrator, {
        waiveFee: input.waive_integrator_fee,
      }),
    });

    const routeId = createRouteId(JSON.stringify(cacheParams));
    const route = { ...convertQuoteToRoute(step), id: routeId };
    await storeLifiRoute(routeId, route);

    return normalizeLifiStepToCrossChainQuote({
      step,
      from: tokens.from,
      to: tokens.to,
      fromTokenSymbol: tokens.fromSymbol,
      toTokenSymbol: tokens.toSymbol,
      routeId,
      route,
    });
  });
}

export async function resolveLifiRouteForExecute(input: {
  routeId?: string;
  route?: Record<string, unknown>;
  lifiRoute?: Record<string, unknown>;
  privyUserId?: string;
  snapshotParams?: Record<string, unknown>;
}): Promise<Route> {
  const embedded = input.lifiRoute ?? input.route;
  if (isExecutableLifiRoute(embedded)) {
    return embedded;
  }

  if (input.routeId) {
    const stored = await getStoredLifiRoute(input.routeId);
    if (isExecutableLifiRoute(stored)) {
      return stored;
    }

    if (input.privyUserId && input.snapshotParams) {
      let requoteError: unknown = null;
      const requoted = await requoteLifiFromSnapshot(input.privyUserId, input.snapshotParams, {
        onError: (err) => {
          requoteError = err;
        },
      });
      if (requoted?.lifi_route && isExecutableLifiRoute(requoted.lifi_route)) {
        return requoted.lifi_route;
      }
      // A fresh quote was attempted but Li-Fi could not provide a usable route
      // (no liquidity / amount too small to cover fees / provider down). Surface
      // that real reason rather than masking it as a stale-cache error.
      if (requoteError instanceof AppError) {
        throw requoteError;
      }
    }

    throw new AppError(404, "LIFI_NO_ROUTE", "Bridge route expired. Fetch a fresh quote and try again.");
  }

  throw new AppError(
    400,
    "LIFI_NO_ROUTE",
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
): "sui" | "solana" | "ethereum" | undefined {
  const value = params[key];
  if (value === "sui" || value === "solana" || value === "ethereum") {
    return value;
  }
  return undefined;
}

/** Re-fetch a Li-Fi quote from execute/approval snapshot fields when route cache expired. */
type RequoteLifiFromSnapshotFn = (
  privyUserId: string,
  params: Record<string, unknown>,
  options?: { onError?: (err: unknown) => void },
) => Promise<CrossChainQuote | null>;

let requoteLifiFromSnapshotOverride: RequoteLifiFromSnapshotFn | null = null;

export function setRequoteLifiFromSnapshotForTests(fn: RequoteLifiFromSnapshotFn | null): void {
  requoteLifiFromSnapshotOverride = fn;
}

export async function requoteLifiFromSnapshot(
  privyUserId: string,
  params: Record<string, unknown>,
  options?: { onError?: (err: unknown) => void },
): Promise<CrossChainQuote | null> {
  if (requoteLifiFromSnapshotOverride) {
    return requoteLifiFromSnapshotOverride(privyUserId, params, options);
  }

  return requoteLifiFromSnapshotLive(privyUserId, params, options);
}

async function requoteLifiFromSnapshotLive(
  privyUserId: string,
  params: Record<string, unknown>,
  options?: { onError?: (err: unknown) => void },
): Promise<CrossChainQuote | null> {
  const fromToken =
    readSnapshotString(params, "from_token_symbol") ??
    readSnapshotString(params, "from_token");
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
    return await getLifiQuote(privyUserId, {
      from_chain_id: fromChainId,
      to_chain_id: toChainId,
      from_evm_chain_id: fromEvmChainId,
      to_evm_chain_id: toEvmChainId,
      from_token: fromToken,
      to_token: toToken,
      amount_atomic: amountAtomic,
      confirm_same_token:
        typeof params.confirm_same_token === "boolean" ? params.confirm_same_token : undefined,
    });
  } catch (err) {
    // Callers that just want display fallback ignore this; the execute path uses
    // it to surface the real Li-Fi reason (e.g. "no route can generate a tx")
    // instead of a misleading "route expired" message.
    options?.onError?.(err);
    return null;
  }
}

/** Routes from getRoutes need per-step refresh; getQuote routes can use getQuote refresh. */
export function routeNeedsStepTransactionRefresh(route: Route): boolean {
  if (!Array.isArray(route.steps) || route.steps.length === 0) {
    return false;
  }
  if (route.steps.length > 1) {
    return true;
  }
  const first = route.steps[0];
  if ((first.includedSteps?.length ?? 0) > 0) {
    return true;
  }
  return !first.transactionRequest?.to;
}

export function buildQuoteRefreshParams(
  route: Route,
  fromAddress: string,
  toAddress?: string,
) {
  const firstStep = Array.isArray(route.steps) ? route.steps[0] : undefined;
  const lastStep = Array.isArray(route.steps) ? route.steps.at(-1) : undefined;
  if (!firstStep || !lastStep) {
    throw new AppError(400, "LIFI_NO_ROUTE", "Route has no steps.");
  }

  const config = getLifiConfig();
  const resolvedToAddress = toAddress ?? route.toAddress ?? lastStep.action.toAddress;
  // Use the route's overall endpoints (top-level fields are authoritative for
  // multi-step routes from cross_chain_routes); fall back to the first/last
  // step when a hand-built route omits them.
  return {
    fromChain: route.fromChainId ?? firstStep.action.fromChainId,
    toChain: route.toChainId ?? lastStep.action.toChainId,
    fromToken: route.fromToken?.address ?? firstStep.action.fromToken.address,
    toToken: route.toToken?.address ?? lastStep.action.toToken.address,
    fromAddress,
    ...(resolvedToAddress ? { toAddress: resolvedToAddress } : {}),
    fromAmount: route.fromAmount,
    slippage: config.defaultSlippage,
    ...lifiIntegratorSdkFields(config),
  };
}

export function resolveSourceChainFromExecuteInput(input: {
  from_chain_id?: ChainId;
  from_evm_chain_id?: number;
  route?: Route;
}): LifiChainRef {
  if (input.from_chain_id || input.from_evm_chain_id !== undefined) {
    return resolveLifiChainRef({
      chain_id: input.from_chain_id,
      evm_chain_id: input.from_evm_chain_id,
    });
  }

  const firstStep = Array.isArray(input.route?.steps) ? input.route.steps[0] : undefined;
  if (firstStep) {
    return lifiToRadiantChainRef(firstStep.action.fromChainId);
  }

  throw new AppError(
    400,
    "VALIDATION_ERROR",
    "Unable to determine source chain for Li-Fi execute.",
  );
}

export { formatAtomicAmount };
