import { isSoroswapEnabled } from "../../../config/soroswap.js";
import { AppError } from "../../../errors/app-error.js";
import { enqueueSoroswapSwapTrackingJob } from "../../../infrastructure/inngest/enqueue-soroswap-tracking.js";
import { invalidateDefiBalanceCache } from "../cache.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import {
  executeSignedStellarTransaction,
  parseTransactionXdr,
  type StellarTxResult,
} from "../../wallet/stellar-transaction.service.js";
import { buildSoroswapTransaction } from "./soroswap-build.service.js";
import { mapSoroswapExecuteError } from "./soroswap.errors.js";
import {
  normalizeSoroswapEffectsStatus,
  normalizeSoroswapTrackingStatus,
} from "./soroswap-normalize.js";
import { resolveSoroswapQuoteForExecute } from "./soroswap-quote-store.service.js";
import { consumeSoroswapExecuteQuota } from "./soroswap-rate-limit.js";
import { getSoroswapSwapStatus } from "./soroswap-status.service.js";
import {
  soroswapExecuteInputSchema,
  type SoroswapExecuteInput,
  type SoroswapExecuteResult,
} from "./soroswap.types.js";
import type { SoroswapTrackJobInput } from "./soroswap-tracking.types.js";
import { resolveSoroswapWalletAddress } from "./soroswap-wallet-addresses.js";
import { getSoroswapExecuteContext } from "./soroswap-execute-context.js";
import {
  buildStellarBuildStep,
  buildStellarConfirmStep,
  buildStellarSignStep,
  buildStellarSubmitStep,
  emitSoroswapExecutionSteps,
} from "../../agent/agent-stream-stellar.js";

export type SoroswapExecuteOptions = {
  transactionId?: string;
  sessionId?: string | null;
};

type ParseXdrFn = (xdr: string) => Awaited<ReturnType<typeof parseTransactionXdr>>;

type ResolveSigningWalletFn = (
  privyUserId: string,
) => Promise<{ privy_wallet_id: string; address: string; signer_added: boolean }>;

type ExecuteSignedFn = (input: {
  privyWalletId: string;
  stellarAddress: string;
  transaction: Awaited<ReturnType<typeof parseTransactionXdr>>;
  simulate?: boolean;
}) => Promise<StellarTxResult>;

type InvalidateBalanceFn = (
  chainId: "stellar",
  address: string,
) => Promise<void>;

type FetchSwapStatusFn = (txHash: string) => Promise<Awaited<ReturnType<typeof getSoroswapSwapStatus>>>;

let executeSignedForTests: ExecuteSignedFn | null = null;
let invalidateBalanceForTests: InvalidateBalanceFn | null = null;
let fetchSwapStatusForTests: FetchSwapStatusFn | null = null;
let resolveSigningWalletForTests: ResolveSigningWalletFn | null = null;
let parseXdrForTests: ParseXdrFn | null = null;
let enqueueTrackingForTests: ((input: SoroswapTrackJobInput) => Promise<void>) | null = null;

/** Test hooks — bypass Privy signing, cache invalidation, and Horizon polling. */
export function setSoroswapExecuteHooksForTests(hooks: {
  executeSigned?: ExecuteSignedFn | null;
  invalidateBalance?: InvalidateBalanceFn | null;
  fetchSwapStatus?: FetchSwapStatusFn | null;
  resolveSigningWallet?: ResolveSigningWalletFn | null;
  parseXdr?: ParseXdrFn | null;
  enqueueTracking?: ((input: SoroswapTrackJobInput) => Promise<void>) | null;
} | null): void {
  executeSignedForTests = hooks?.executeSigned ?? null;
  invalidateBalanceForTests = hooks?.invalidateBalance ?? null;
  fetchSwapStatusForTests = hooks?.fetchSwapStatus ?? null;
  resolveSigningWalletForTests = hooks?.resolveSigningWallet ?? null;
  parseXdrForTests = hooks?.parseXdr ?? null;
  enqueueTrackingForTests = hooks?.enqueueTracking ?? null;
}

function snapshotParamsFromExecuteInput(input: SoroswapExecuteInput): Record<string, unknown> {
  return {
    ...(input.token_in ? { token_in: input.token_in } : {}),
    ...(input.token_out ? { token_out: input.token_out } : {}),
    ...(input.amount ? { amount: input.amount } : {}),
    ...(input.trade_type ? { trade_type: input.trade_type } : {}),
    ...(input.slippage !== undefined ? { slippage: input.slippage } : {}),
    ...(input.from_address ? { from_address: input.from_address } : {}),
  };
}

async function resolveSigningWallet(privyUserId: string) {
  if (resolveSigningWalletForTests) {
    const wallet = await resolveSigningWalletForTests(privyUserId);
    if (!wallet.signer_added) {
      throw new AppError(403, "WALLET_SIGNER_NOT_CONFIGURED", "Session signer not configured.");
    }
    return wallet;
  }

  const agentWallet = await resolveAgentWalletByPrivyUserId(privyUserId, "stellar");
  if (!agentWallet) {
    throw new AppError(404, "WALLET_NOT_FOUND", "Agent wallet not registered for chain stellar.");
  }
  if (!agentWallet.signer_added) {
    throw new AppError(403, "WALLET_SIGNER_NOT_CONFIGURED", "Session signer not configured.");
  }
  return agentWallet;
}

async function executeSignedTransaction(input: {
  privyWalletId: string;
  stellarAddress: string;
  transaction: Awaited<ReturnType<typeof parseTransactionXdr>>;
}): Promise<StellarTxResult> {
  if (executeSignedForTests) {
    return executeSignedForTests({ ...input, simulate: false });
  }
  return executeSignedStellarTransaction({
    privyWalletId: input.privyWalletId,
    stellarAddress: input.stellarAddress,
    transaction: input.transaction,
    simulate: false,
  });
}

async function invalidateStellarBalance(address: string): Promise<void> {
  if (invalidateBalanceForTests) {
    await invalidateBalanceForTests("stellar", address);
    return;
  }
  await invalidateDefiBalanceCache("stellar", address);
}

async function parseBuiltXdr(xdr: string) {
  if (parseXdrForTests) {
    return parseXdrForTests(xdr);
  }
  return parseTransactionXdr(xdr);
}

async function fetchSwapStatus(txHash: string) {
  if (fetchSwapStatusForTests) {
    return fetchSwapStatusForTests(txHash);
  }
  return getSoroswapSwapStatus(txHash);
}

async function maybeEnqueueSwapTracking(
  privyUserId: string,
  txHash: string,
  trackingStatus: ReturnType<typeof normalizeSoroswapTrackingStatus>,
  options?: SoroswapExecuteOptions,
): Promise<void> {
  if (!options?.transactionId || trackingStatus !== "pending") {
    return;
  }

  const job: SoroswapTrackJobInput = {
    transactionId: options.transactionId,
    sessionId: options.sessionId ?? null,
    privyUserId,
    txHash,
  };

  if (enqueueTrackingForTests) {
    await enqueueTrackingForTests(job);
    return;
  }

  void enqueueSoroswapSwapTrackingJob(job).catch(() => undefined);
}

/** Build, sign, and broadcast a Soroswap Stellar swap. */
export async function executeSoroswapSwap(
  privyUserId: string,
  input: SoroswapExecuteInput,
  options?: SoroswapExecuteOptions,
): Promise<SoroswapExecuteResult> {
  if (!isSoroswapEnabled()) {
    throw new AppError(503, "SOROSWAP_UNAVAILABLE", "Stellar swap service is temporarily unavailable.");
  }

  const parsed = soroswapExecuteInputSchema.parse(input);
  const quoteRef = parsed.quote_id ?? parsed.route_id;
  if (!quoteRef?.trim()) {
    throw new AppError(400, "VALIDATION_ERROR", "quote_id or route_id is required.", {
      field: "quote_id",
    });
  }

  await consumeSoroswapExecuteQuota(privyUserId);

  const snapshotParams = snapshotParamsFromExecuteInput(parsed);
  const hasSnapshot = Object.keys(snapshotParams).length > 0;

  try {
    const stored = await resolveSoroswapQuoteForExecute({
      quoteId: quoteRef,
      routeId: parsed.route_id,
      ...(hasSnapshot ? { snapshotParams, privyUserId } : { privyUserId }),
    });

    const quoteId = stored.quote_id;
    const agentWallet = await resolveSigningWallet(privyUserId);
    const walletAddress = await resolveSoroswapWalletAddress(privyUserId, parsed.from_address);
    const streamCtx = getSoroswapExecuteContext();
    const streamMeta = {
      transaction_id: options?.transactionId,
      token_in: parsed.token_in,
      token_out: parsed.token_out,
      quote_id: quoteId,
    };

    if (streamCtx?.sessionId) {
      emitSoroswapExecutionSteps(streamCtx.sessionId, [
        buildStellarBuildStep("running", streamMeta),
      ]);
    }

    const built = await buildSoroswapTransaction(privyUserId, {
      quoteId,
      routeId: parsed.route_id ?? quoteId,
      fromAddress: parsed.from_address,
      ...(hasSnapshot ? { snapshotParams } : {}),
    });

    if (streamCtx?.sessionId) {
      emitSoroswapExecutionSteps(streamCtx.sessionId, [
        buildStellarBuildStep("ok", streamMeta),
        buildStellarSignStep("running", streamMeta),
      ]);
    }

    const transaction = await parseBuiltXdr(built.xdr);

    if (streamCtx?.sessionId) {
      emitSoroswapExecutionSteps(streamCtx.sessionId, [buildStellarSignStep("ok", streamMeta)]);
    }

    const submitted = await executeSignedTransaction({
      privyWalletId: agentWallet.privy_wallet_id,
      stellarAddress: walletAddress,
      transaction,
    });

    let statusResult: Awaited<ReturnType<typeof fetchSwapStatus>> | null = null;
    let trackingStatus: ReturnType<typeof normalizeSoroswapTrackingStatus> = "pending";
    let effectsStatus: ReturnType<typeof normalizeSoroswapEffectsStatus> = "pending";

    try {
      statusResult = await fetchSwapStatus(submitted.hash);
      trackingStatus = normalizeSoroswapTrackingStatus(statusResult.status);
      effectsStatus = normalizeSoroswapEffectsStatus(trackingStatus);
    } catch {
      trackingStatus = "pending";
      effectsStatus = "pending";
    }

    const submitMeta = { ...streamMeta, digest: submitted.hash };
    if (streamCtx?.sessionId) {
      emitSoroswapExecutionSteps(streamCtx.sessionId, [
        buildStellarSubmitStep("ok", submitMeta),
        buildStellarConfirmStep(
          trackingStatus === "success" ? "ok" : trackingStatus === "failed" ? "failed" : "running",
          submitMeta,
        ),
      ]);
    }

    if (trackingStatus === "success") {
      await invalidateStellarBalance(walletAddress);
    }

    await maybeEnqueueSwapTracking(privyUserId, submitted.hash, trackingStatus, options);

    return {
      quote_id: quoteId,
      route_id: parsed.route_id ?? quoteId,
      tx_hash: submitted.hash,
      stellar_address: walletAddress,
      ...(statusResult && typeof statusResult.ledger === "number"
        ? { ledger: statusResult.ledger }
        : {}),
      effects_status: effectsStatus,
      tracking_status: trackingStatus,
    };
  } catch (err) {
    throw mapSoroswapExecuteError(err);
  }
}
