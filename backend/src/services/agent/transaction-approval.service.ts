import { randomUUID } from "node:crypto";
import { getDeepBookEnv } from "../../config/deepbook.js";
import {
  estimateSwapNotionalSui,
  isDeepBookSwapAction,
  parseDeepBookSwapParams,
} from "../defi/deepbook/deepbook-swap.service.js";
import {
  estimatePlaceOrderNotionalSui,
  isDeepBookCancelOrderAction,
  isDeepBookOrderAction,
  isDeepBookPlaceOrderAction,
} from "../defi/deepbook/deepbook-orders.service.js";
import {
  isDeepBookFlashLoanAction,
  parseDeepBookFlashLoanParams,
} from "../defi/deepbook/deepbook-flash-loan.service.js";
import {
  isDeepBookStakeAction,
} from "../defi/deepbook/deepbook-stake.service.js";
import {
  isDeepBookGovernanceAction,
} from "../defi/deepbook/deepbook-governance.service.js";
import { isDeepBookMarginAction } from "../defi/deepbook/deepbook-margin.service.js";
import { isDeepBookPredictAction } from "../defi/deepbook/deepbook-predict.service.js";
import type { FlashLoanRepaySource } from "../defi/deepbook/deepbook-flash-loan.types.js";
import type { ExecuteTransactionInput, TxResult } from "../chains/types.js";
import type { AppActionSource } from "../projects/app-action.types.js";
import type { PinnedAppScope } from "../projects/pinned-app-scope.types.js";
import type { PendingTransaction } from "./agent.types.js";
import type { LiquidityFallbackOffer } from "../defi/cross-chain/cross-chain.types.js";
import { AppError } from "../../errors/app-error.js";
import { mapAgentToolError } from "../../utils/agent-tool-errors.js";
import { mapLifiExecuteError } from "../defi/lifi/lifi.errors.js";
import { runExecuteTransactionTool } from "./execute-transaction.tool.js";
import {
  getAgentPermissions,
  resolveAutoApproveMaxAtomic,
  resolveAutoApproveMaxDisplay,
} from "./agent-permissions.service.js";
import type { AgentPermissions } from "./agent-permissions.types.js";
import { getDeepBookManagerInfo } from "../defi/deepbook/deepbook-balance-manager.service.js";
import {
  isDeepBookProvisionAction,
  validateExecuteTransactionInput,
} from "./deepbook/validate-execute-transaction.js";
import { buildTransactionDisplay } from "../agent-transaction/deepbook/build-display.js";
import { buildDeFiApprovalPreview } from "../agent-transaction/approval-preview/build-preview.js";
import { enrichExecuteInputForApproval } from "../agent-transaction/approval-preview/enrichers/registry.js";
import { enrichCrossChainExecuteInput } from "../agent-transaction/approval-preview/enrichers/cross-chain.js";
import { isSquidCrossChainRoute } from "../agent-transaction/approval-preview/enrichers/squid.js";
import { isLifiApprovalDisplayComplete } from "../agent-transaction/approval-preview/enrichers/lifi-route-params.js";
import { isSquidApprovalDisplayComplete } from "../agent-transaction/approval-preview/enrichers/squid-route-params.js";
import { isExecutableLifiRoute } from "../defi/lifi/lifi-normalize.js";
import {
  coalesceDeFiQuoteExpiresAt,
  isDeFiQuoteExpired,
  isLifiContinuationApproval,
  readDeFiQuoteExpiresAt,
} from "../agent-transaction/approval-preview/quote-expiry.js";
import {
  findExistingLifiContinuationPending,
  prepareLifiContinuationExecuteInput,
  type MaybeCreateLifiContinuationInput,
} from "../defi/lifi/lifi-continuation-pending.js";
import { previewExecuteTransactionFiat } from "../market/valuation.service.js";
import { isLifiExecuteAction } from "./chains/evm/lifi/execute-actions.js";
import { preflightLifiExecuteBalance } from "./chains/evm/lifi/approval-preflight.js";
import { enqueueLifiCrossChainTrackingJob, enqueueLifiSwapTrackingJob } from "../../infrastructure/inngest/enqueue-lifi-tracking.js";
import {
  attachLifiMetaToTxResult,
  readLifiTrackingFromTxResult,
  shouldEnqueueLifiCrossChainTracking,
  shouldEnqueueLifiSwapTracking,
} from "../defi/lifi/lifi-tracking.js";
import { buildInitialLifiExecutionSteps } from "../defi/lifi/lifi-status-tracker.service.js";
import { emitLiquidityFallbackOfferedStep } from "./agent-stream-cross-chain.js";
import { emitAgentStreamExecutionStep } from "./agent-stream-lifi.js";
import { runWithLifiExecuteContext } from "../defi/lifi/lifi-execute-context.js";
import {
  claimPendingApprovalForUser,
  claimPendingRejectionForUser,
  clearPendingApprovalsForTests,
  executeInputFromRecord,
  expireStalePendingApprovals,
  markCompleted,
  markLifiSubmitted,
  pendingTransactionFromRecord,
  recordPendingApproval,
  revertPendingApprovalToClaimable,
} from "../agent-transaction/agent-transaction.service.js";
import type { ExecuteTransactionContext } from "./execute-transaction-context.js";

const TRANSFER_ACTIONS = new Set([
  "transfer_native",
  "transfer_sui",
  "transfer",
  "transfer_eth",
  "transfer_sol",
]);

const DEEPBOOK_WRITE_ACTIONS = new Set(["deepbook_deposit", "deepbook_withdraw"]);
const DEEPBOOK_SETTLED_ACTIONS = new Set([
  "deepbook_withdraw_settled_amounts",
  "deepbook_withdraw_settled_amounts_permissionless",
]);
const DEEPBOOK_PROVISION_ACTIONS = new Set(["deepbook_provision_manager"]);

const MUTATING_EXECUTE_ACTIONS = new Set([
  ...TRANSFER_ACTIONS,
  ...DEEPBOOK_WRITE_ACTIONS,
  ...DEEPBOOK_PROVISION_ACTIONS,
  "swap",
  "deepbook_swap",
  "deepbook_place_limit_order",
  "deepbook_place_market_order",
  "deepbook_cancel_order",
  "deepbook_cancel_orders",
  "deepbook_cancel_all_orders",
  "deepbook_modify_order",
  "deepbook_withdraw_settled_amounts",
  "deepbook_withdraw_settled_amounts_permissionless",
  "deepbook_flash_loan",
  "deepbook_stake",
  "deepbook_unstake",
  "deepbook_submit_proposal",
  "deepbook_vote",
  "cross_chain_swap",
  "lifi_approve",
  "execute_bytes",
]);

function isMutatingExecuteAction(action: string): boolean {
  return (
    isDeepBookSwapAction(action) ||
    isDeepBookOrderAction(action) ||
    isDeepBookFlashLoanAction(action) ||
    isDeepBookStakeAction(action) ||
    isDeepBookGovernanceAction(action) ||
    isDeepBookMarginAction(action) ||
    isDeepBookPredictAction(action) ||
    MUTATING_EXECUTE_ACTIONS.has(action)
  );
}

async function pruneExpired(): Promise<void> {
  await expireStalePendingApprovals();
}

export function buildLiquidityFallbackPendingFromOffer(
  input: ExecuteTransactionInput,
  offer: LiquidityFallbackOffer,
  id = randomUUID(),
): PendingTransaction {
  const fromSymbol = offer.from_token;
  const toSymbol = offer.to_token;
  return {
    id,
    chain_id: input.chain_id,
    action: input.action,
    params: {
      ...input.params,
      approval_outcome: "liquidity_fallback_offered",
      liquidity_fallback_offer: offer,
    },
    summary: `Alternate route available for ${fromSymbol} → ${toSymbol}`,
    amount_display: `${fromSymbol} → ${toSymbol}`,
    quote_expires_at: offer.expires_at,
    fiat_preview: null,
    defi_preview: null,
    approval_outcome: "liquidity_fallback_offered",
    liquidity_fallback_offer: offer,
  };
}

type CreateLiquidityFallbackPendingFn = (
  privyUserId: string,
  input: ExecuteTransactionInput,
  offer: LiquidityFallbackOffer,
  context?: ExecuteTransactionContext,
) => Promise<PendingTransaction>;

let createLiquidityFallbackPendingForTests: CreateLiquidityFallbackPendingFn | null = null;

export function setCreateLiquidityFallbackPendingForTests(
  fn: CreateLiquidityFallbackPendingFn | null,
): void {
  createLiquidityFallbackPendingForTests = fn;
}

export async function createLiquidityFallbackPendingTransaction(
  privyUserId: string,
  input: ExecuteTransactionInput,
  offer: LiquidityFallbackOffer,
  context?: ExecuteTransactionContext,
): Promise<PendingTransaction> {
  if (createLiquidityFallbackPendingForTests) {
    return createLiquidityFallbackPendingForTests(privyUserId, input, offer, context);
  }

  await pruneExpired();
  const pending = buildLiquidityFallbackPendingFromOffer(input, offer);

  await recordPendingApproval({
    privyUserId,
    sessionId: context?.sessionId,
    messageId: context?.messageId,
    workflowStepIndex: context?.workflowStepIndex,
    input: {
      chain_id: pending.chain_id,
      action: pending.action,
      params: pending.params,
    },
    pending,
  });

  if (context?.sessionId && pending.liquidity_fallback_offer) {
    emitLiquidityFallbackOfferedStep(context.sessionId, pending.liquidity_fallback_offer);
  }

  return pending;
}

export async function buildPendingTransactionPreview(
  privyUserId: string,
  input: ExecuteTransactionInput,
  id = randomUUID(),
): Promise<PendingTransaction> {
  const enrichResult = await enrichExecuteInputForApproval(privyUserId, input);

  if (enrichResult.kind === "liquidity_fallback_offered") {
    return buildLiquidityFallbackPendingFromOffer(enrichResult.input, enrichResult.liquidity_fallback_offer, id);
  }

  let enriched = enrichResult.input;
  if (isLifiExecuteAction(enriched.action)) {
    if (isLifiContinuationApproval(enriched.params)) {
      enriched.params = {
        ...enriched.params,
        lifi_continuation: true,
        approval_kind: "lifi_continue",
      };
      delete enriched.params.expires_at;
      delete enriched.params.quote_expires_at;
    } else {
      const coalescedExpiry = coalesceDeFiQuoteExpiresAt(readDeFiQuoteExpiresAt(enriched.params));
      enriched.params = {
        ...enriched.params,
        expires_at: coalescedExpiry,
        quote_expires_at: coalescedExpiry,
      };
    }
  }
  validateExecuteTransactionInput(enriched);
  const { title, amount_display: amountDisplay } = await buildTransactionDisplay(
    privyUserId,
    enriched,
  );

  const fiat_preview = await previewExecuteTransactionFiat(enriched);
  const defi_preview = buildDeFiApprovalPreview(
    { title, amount_display: amountDisplay },
    enriched,
    fiat_preview,
  );

  return {
    id,
    chain_id: enriched.chain_id,
    action: enriched.action,
    params: enriched.params,
    amount_display: defi_preview?.amount_display ?? amountDisplay,
    summary: defi_preview?.title ?? title,
    quote_expires_at: isLifiContinuationApproval(enriched.params)
      ? null
      : readDeFiQuoteExpiresAt(enriched.params),
    fiat_preview,
    defi_preview,
    approval_outcome: "approval_required",
  };
}

function parseAmountAtomic(params: Record<string, unknown>): bigint | null {
  const raw = params.amount_atomic ?? params.amount_mist ?? params.amount_wei ?? params.amount_lamports;
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) {
    return null;
  }
  return BigInt(raw);
}

export function bridgeRequiresApprovalWithPermissions(
  _permissions: AgentPermissions,
  input: ExecuteTransactionInput,
): boolean {
  return isLifiExecuteAction(input.action);
}

export function swapRequiresApprovalWithPermissions(
  permissions: AgentPermissions,
  input: ExecuteTransactionInput,
): boolean {
  if (!isDeepBookSwapAction(input.action) || input.chain_id !== "sui") {
    return false;
  }

  if (!permissions.auto_approve_enabled) {
    return true;
  }

  try {
    const parsed = parseDeepBookSwapParams(input.params);
    const price =
      typeof input.params.estimated_price === "number" ? input.params.estimated_price : null;
    const poolDef = getDeepBookEnv().pools[parsed.pool_key as keyof ReturnType<typeof getDeepBookEnv>["pools"]];
    const inputCoin =
      parsed.side === "sell" ? (poolDef?.baseCoin ?? "SUI") : (poolDef?.quoteCoin ?? "USDC");

    let suiPerInput: number | null = null;
    if (inputCoin.toUpperCase() === "SUI") {
      suiPerInput = 1;
    } else if (price && price > 0) {
      suiPerInput = parsed.side === "sell" ? 1 / price : price;
    }

    const notionalSui = estimateSwapNotionalSui(inputCoin, parsed.amount, suiPerInput);
    return notionalSui > resolveAutoApproveMaxDisplay(permissions, "sui");
  } catch {
    return true;
  }
}

export function orderRequiresApprovalWithPermissions(
  permissions: AgentPermissions,
  input: ExecuteTransactionInput,
): boolean {
  if (!isDeepBookPlaceOrderAction(input.action) || input.chain_id !== "sui") {
    return false;
  }

  if (!permissions.auto_approve_enabled) {
    return true;
  }

  try {
    const price =
      typeof input.params.estimated_price === "number" ? input.params.estimated_price : null;
    const notionalSui = estimatePlaceOrderNotionalSui(input.action, input.params, price);
    return notionalSui > resolveAutoApproveMaxDisplay(permissions, "sui");
  } catch {
    return true;
  }
}

export function flashLoanRequiresApproval(
  permissions: AgentPermissions,
  input: ExecuteTransactionInput,
): boolean {
  if (!permissions.allow_flash_loans) {
    return true;
  }

  try {
    const parsed = parseDeepBookFlashLoanParams(input.params);
    const repaySource: FlashLoanRepaySource = parsed.repay_source;
    if (repaySource === "wallet" || repaySource === "merged") {
      return true;
    }
    return !permissions.auto_approve_flash_loans;
  } catch {
    return true;
  }
}

export function transferRequiresApprovalWithPermissions(
  permissions: AgentPermissions,
  input: ExecuteTransactionInput,
): boolean {
  if (!permissions.auto_approve_enabled && isMutatingExecuteAction(input.action)) {
    return true;
  }

  if (isDeepBookFlashLoanAction(input.action)) {
    return flashLoanRequiresApproval(permissions, input);
  }

  if (isDeepBookStakeAction(input.action)) {
    return true;
  }

  if (isDeepBookGovernanceAction(input.action)) {
    return true;
  }

  if (isDeepBookMarginAction(input.action)) {
    return true;
  }

  if (isDeepBookPredictAction(input.action)) {
    return true;
  }

  if (
    DEEPBOOK_WRITE_ACTIONS.has(input.action) ||
    DEEPBOOK_PROVISION_ACTIONS.has(input.action) ||
    DEEPBOOK_SETTLED_ACTIONS.has(input.action)
  ) {
    return true;
  }

  if (input.action === "deepbook_modify_order") {
    return true;
  }

  if (isDeepBookSwapAction(input.action)) {
    return swapRequiresApprovalWithPermissions(permissions, input);
  }

  if (isLifiExecuteAction(input.action)) {
    return bridgeRequiresApprovalWithPermissions(permissions, input);
  }

  if (isDeepBookCancelOrderAction(input.action)) {
    return true;
  }

  if (isDeepBookPlaceOrderAction(input.action)) {
    return orderRequiresApprovalWithPermissions(permissions, input);
  }

  if (input.action === "execute_bytes") {
    return true;
  }

  if (!TRANSFER_ACTIONS.has(input.action)) {
    return false;
  }

  if (!permissions.auto_approve_enabled) {
    return true;
  }

  const amount = parseAmountAtomic(input.params);
  if (amount === null) {
    return true;
  }

  return amount > resolveAutoApproveMaxAtomic(permissions, input.chain_id);
}

export type TransferRequiresApprovalOptions = {
  pinnedAppScope?: PinnedAppScope | null;
  /** Artifact POST /actions/* — always in-app confirm; agent auto-approve does not apply. */
  source?: AppActionSource;
};

/** True when an action was initiated from the artifact UI and must confirm in-app. */
export function artifactUiActionRequiresApproval(input: ExecuteTransactionInput): boolean {
  return isMutatingExecuteAction(input.action);
}

export async function transferRequiresApproval(
  privyUserId: string,
  input: ExecuteTransactionInput,
  options: TransferRequiresApprovalOptions = {},
): Promise<boolean> {
  if (options.pinnedAppScope && isDeepBookSwapAction(input.action)) {
    return true;
  }

  if (isDeepBookProvisionAction(input.action)) {
    const info = await getDeepBookManagerInfo(privyUserId);
    if (info.provisioned) {
      return false;
    }
  }

  if (options.source === "ui" && artifactUiActionRequiresApproval(input)) {
    return true;
  }

  const permissions = await getAgentPermissions(privyUserId);
  return transferRequiresApprovalWithPermissions(permissions, input);
}

export async function createPendingTransaction(
  privyUserId: string,
  input: ExecuteTransactionInput,
  context?: ExecuteTransactionContext,
): Promise<PendingTransaction> {
  await pruneExpired();

  const pending = await buildPendingTransactionPreview(privyUserId, input);

  await recordPendingApproval({
    privyUserId,
    sessionId: context?.sessionId,
    messageId: context?.messageId,
    workflowStepIndex: context?.workflowStepIndex,
    input: {
      chain_id: pending.chain_id,
      action: pending.action,
      params: pending.params,
    },
    pending,
  });

  if (context?.sessionId && pending.approval_outcome === "liquidity_fallback_offered") {
    const offer = pending.liquidity_fallback_offer;
    if (offer) {
      emitLiquidityFallbackOfferedStep(context.sessionId, offer);
    }
  }

  return pending;
}

export type ApprovalResult =
  | { ok: true; pending: PendingTransaction; result: TxResult; continuation_pending?: PendingTransaction }
  | { ok: false; pending: PendingTransaction; error: AppError; retryable?: boolean };

export async function maybeCreateLifiContinuationFromTracking(
  input: MaybeCreateLifiContinuationInput,
): Promise<PendingTransaction | null> {
  const existing = await findExistingLifiContinuationPending(input);
  if (existing) {
    return existing;
  }

  const continuationInput = await prepareLifiContinuationExecuteInput(input);
  if (!continuationInput) {
    return null;
  }

  return createPendingTransaction(input.privyUserId, continuationInput, {
    sessionId: input.sessionId ?? undefined,
  });
}

export async function approvePendingTransaction(
  privyUserId: string,
  transactionId: string,
): Promise<ApprovalResult | null> {
  await pruneExpired();

  const claimed = await claimPendingApprovalForUser(privyUserId, transactionId);
  if (!claimed) {
    return null;
  }

  const pending = pendingTransactionFromRecord(claimed);
  let executeInput = executeInputFromRecord(claimed);

  if (isLifiExecuteAction(executeInput.action)) {
    const isSquid = isSquidCrossChainRoute(executeInput.params);
    const hasStoredRoute = isSquid
      ? Boolean(executeInput.params.squid_route)
      : isExecutableLifiRoute(
          executeInput.params.lifi_route ?? executeInput.params.route,
        );
    const displayComplete = isSquid
      ? isSquidApprovalDisplayComplete(executeInput.params)
      : isLifiApprovalDisplayComplete(executeInput.params);
    if (!hasStoredRoute || !displayComplete) {
      executeInput = await enrichCrossChainExecuteInput(privyUserId, executeInput, {
        requoteOnCacheMiss: !isLifiContinuationApproval(executeInput.params),
      });
    }
    if (isLifiContinuationApproval(executeInput.params)) {
      executeInput = {
        ...executeInput,
        params: {
          ...executeInput.params,
          lifi_continuation: true,
          approval_kind: "lifi_continue",
        },
      };
      delete executeInput.params.expires_at;
      delete executeInput.params.quote_expires_at;
    } else {
      const coalescedExpiry = coalesceDeFiQuoteExpiresAt(readDeFiQuoteExpiresAt(executeInput.params));
      executeInput = {
        ...executeInput,
        params: {
          ...executeInput.params,
          expires_at: coalescedExpiry,
          quote_expires_at: coalescedExpiry,
        },
      };
    }
  } else if (isDeepBookSwapAction(executeInput.action)) {
    const enrichResult = await enrichExecuteInputForApproval(privyUserId, executeInput);
    executeInput = enrichResult.input;
  }

  if (
    (isDeepBookSwapAction(executeInput.action) ||
      (isLifiExecuteAction(executeInput.action) &&
        !isLifiContinuationApproval(executeInput.params))) &&
    isDeFiQuoteExpired(executeInput.params)
  ) {
    const error = new AppError(
      400,
      "QUOTE_EXPIRED",
      isLifiExecuteAction(executeInput.action)
        ? "This bridge quote expired. Cancel and ask again to get a fresh rate before approving."
        : "This swap quote expired. Cancel and ask again to get a fresh rate before approving.",
    );
    await markCompleted(transactionId, {
      kind: "failure",
      error: { code: error.code, message: error.message },
    });
    return { ok: false, pending, error };
  }

  try {
    if (isLifiExecuteAction(executeInput.action)) {
      await preflightLifiExecuteBalance(privyUserId, executeInput);
    }

    const sessionId = claimed.session_id ?? undefined;
    const continuationContext: ExecuteTransactionContext = {
      sessionId,
      messageId: claimed.message_id ?? undefined,
      workflowStepIndex: claimed.workflow_step_index ?? undefined,
    };
    const result = await runWithLifiExecuteContext(
      { sessionId, transactionId },
      () => runExecuteTransactionTool(privyUserId, executeInput),
    );

    const tracking = readLifiTrackingFromTxResult(result);
    const needsCrossChainTracking =
      isLifiExecuteAction(executeInput.action) &&
      shouldEnqueueLifiCrossChainTracking(result, tracking);
    const needsSwapTracking =
      isLifiExecuteAction(executeInput.action) && shouldEnqueueLifiSwapTracking(result, tracking);
    const needsLifiTracking = needsCrossChainTracking || needsSwapTracking;

    if (needsLifiTracking) {
      const enriched = attachLifiMetaToTxResult(result, tracking);
      await markLifiSubmitted(transactionId, {
        digest: enriched.digest || tracking.tx_hashes[0] || null,
        effects_status: "pending",
        result: enriched,
      });

      if (sessionId) {
        for (const step of buildInitialLifiExecutionSteps({
          tracking,
          transactionId,
          chainId: enriched.chain_id,
          digest: enriched.digest || tracking.tx_hashes[0] || null,
          evmChainId: enriched.evm_chain_id ?? tracking.from_evm_chain_id,
        })) {
          emitAgentStreamExecutionStep(sessionId, step);
        }
      }

      const enqueue = needsSwapTracking
        ? enqueueLifiSwapTrackingJob
        : enqueueLifiCrossChainTrackingJob;
      void enqueue({
        transactionId,
        privyUserId,
        sessionId: sessionId ?? null,
        tracking,
      }).catch(() => undefined);

      // Destination-chain continuation approvals are created by the Li-Fi status
      // poll when ACTION_REQUIRED is detected — not here. Returning one in the
      // approve HTTP response kept the source approval bar mounted.

      return {
        ok: true,
        pending,
        result: enriched,
      };
    }

    await markCompleted(transactionId, { kind: "success", result });
    return {
      ok: true,
      pending,
      result,
    };
  } catch (err) {
    const mapError = isLifiExecuteAction(executeInput.action)
      ? mapLifiExecuteError
      : mapAgentToolError;
    const error = mapError(err);
    if (isRetryablePreBroadcastError(error.code)) {
      // Nothing was broadcast on chain (rate limit / balance / quote preflight),
      // so keep the approval claimable instead of consuming it — otherwise every
      // retry hits "approval expired or was not found" and the modal flickers.
      await revertPendingApprovalToClaimable(transactionId, claimed.user_id);
    } else {
      await markCompleted(transactionId, {
        kind: "failure",
        error: { code: error.code, message: error.message },
      });
    }
    return {
      ok: false,
      pending,
      error,
      retryable: isRetryablePreBroadcastError(error.code),
    };
  }
}

/**
 * Error codes raised *before* any on-chain broadcast/signing during approval
 * execution. A failure with one of these leaves the wallet untouched, so the
 * pending approval can safely be reverted to `pending_approval` for retry.
 * Codes that may have broadcast (TRANSACTION_FAILED, APPROVAL_FAILED) are
 * deliberately excluded and consume the approval.
 */
const RETRYABLE_PRE_BROADCAST_ERROR_CODES = new Set([
  "RATE_LIMITED",
  "LIFI_RATE_LIMITED",
  "LIFI_UNAVAILABLE",
  "LIFI_VALIDATION_ERROR",
  "LIFI_NO_ROUTE",
  "INSUFFICIENT_BALANCE",
  "WALLET_NOT_FOUND",
  "WALLET_SIGNER_NOT_CONFIGURED",
  "WALLET_ADDRESS_MISMATCH",
  "PRICE_UNAVAILABLE",
  "AMOUNT_TOO_SMALL",
  "AMOUNT_REQUIRED",
  "VALIDATION_ERROR",
]);

export function isRetryablePreBroadcastError(code: string): boolean {
  return RETRYABLE_PRE_BROADCAST_ERROR_CODES.has(code);
}

export async function rejectPendingTransaction(
  privyUserId: string,
  transactionId: string,
): Promise<PendingTransaction | null> {
  await pruneExpired();

  const rejected = await claimPendingRejectionForUser(privyUserId, transactionId);
  if (!rejected) {
    return null;
  }

  return pendingTransactionFromRecord(rejected);
}

/** Test hook — clear pending approval rows from the database. */
export async function clearPendingTransactionsForTests(): Promise<void> {
  await clearPendingApprovalsForTests();
}
