import { ZodError } from "zod";
import { AppError } from "../errors/app-error.js";
import {
  isStellarRpcRateLimitError,
  stellarRpcRateLimitAppError,
} from "../infrastructure/stellar/rpc-retry.js";
import { isStellarRpcUnavailableError, stellarRpcUnavailableAppError } from "../config/stellar.js";
import { isSuiRpcRateLimitError, suiRpcRateLimitAppError } from "../infrastructure/sui/rpc-retry.js";
import { formatZodValidationError } from "./format-zod-validation.js";

const BASE58_ALPHABET =
  /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

/** Map unexpected tool/transaction failures to user-facing AppErrors. */
export function mapAgentToolError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }

  if (err instanceof ZodError) {
    return new AppError(400, "VALIDATION_ERROR", formatZodValidationError(err), {
      issues: err.issues,
    });
  }

  const message = errorMessage(err);

  if (
    /insufficient\s*balance|insufficientcoinbalance|not enough\s+\w+|insufficient funds|exceeds balance|gas required exceeds/i.test(
      message,
    )
  ) {
    return new AppError(
      400,
      "INSUFFICIENT_BALANCE",
      "You do not have enough of the required token or native ETH for network gas to complete this transaction.",
      { cause: message },
    );
  }

  if (/unknown letter/i.test(message) && /allowed/i.test(message)) {
    return new AppError(
      502,
      "INVALID_PUBLIC_KEY",
      "The agent wallet public key could not be read. Try reconnecting or re-registering the wallet.",
    );
  }

  if (/slippage|min_out|minimum output/i.test(message)) {
    return new AppError(400, "SLIPPAGE_EXCEEDED", message);
  }

  if (/coin.*not found|no valid gas coins|object not found/i.test(message)) {
    return new AppError(
      400,
      "INSUFFICIENT_BALANCE",
      "Unable to complete this transaction — your wallet does not have enough SUI for network gas.",
      { cause: message },
    );
  }

  if (/fetch failed|ECONNRESET|ETIMEDOUT|network request failed/i.test(message)) {
    return new AppError(
      503,
      "SUI_RPC_UNAVAILABLE",
      "Could not reach Sui RPC. Try again in a moment.",
      { cause: message },
    );
  }

  if (isSuiRpcRateLimitError(err)) {
    return suiRpcRateLimitAppError(err);
  }

  if (isStellarRpcUnavailableError(err)) {
    return stellarRpcUnavailableAppError(err);
  }

  if (isStellarRpcRateLimitError(err)) {
    return stellarRpcRateLimitAppError(err);
  }

  return new AppError(400, "TRANSACTION_ERROR", message.slice(0, 500));
}

export type AgentToolErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

/** Structured tool error content for the model (tool role) — not shown directly to users. */
export function toolErrorToModelContent(error: AgentToolErrorPayload): string {
  const guidance = guidanceForErrorCode(error.code);
  return JSON.stringify(
    {
      ok: false,
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
      agent_instruction: guidance,
    },
    null,
    2,
  );
}

function guidanceForErrorCode(code: string): string {
  switch (code) {
    case "INSUFFICIENT_BALANCE":
      return "Explain the wallet lacks enough of the required token and/or native gas on the source network (SUI for Sui, ETH on the specific EVM network for bridges). Suggest funding the agent wallet on that network or using a smaller amount.";
    case "SLIPPAGE_EXCEEDED":
      return "Explain the swap could not complete due to price movement. Suggest a smaller amount or higher slippage.";
    case "SUI_RPC_UNAVAILABLE":
    case "SUI_RPC_RATE_LIMITED":
      return "Explain Sui RPC was temporarily busy or unreachable. Suggest waiting a few seconds and retrying the swap. Do NOT use this explanation for deploy_app or publish_app failures — those are not on-chain.";
    case "STELLAR_RPC_UNAVAILABLE":
    case "STELLAR_RPC_RATE_LIMITED":
      return "Explain Stellar RPC (Horizon or Soroban) was temporarily busy or unreachable. Suggest waiting a few seconds and retrying.";
    case "STELLAR_CHAIN_NOT_CONFIGURED":
      return "Explain Stellar is not configured on this deployment. Suggest contacting the operator or using an enabled chain.";
    case "CROSS_ECOSYSTEM_NOT_SUPPORTED":
      return "Explain cross-ecosystem bridging (e.g. Stellar to EVM) is not supported in v1. Suggest same-chain swaps or enabled EVM bridges only.";
    case "DEFI_ROUTE_NOT_FOUND":
      return "Explain no DeFi provider is configured for the requested chain and capability. Suggest an enabled chain or same-chain swap.";
    case "LIFI_RATE_LIMITED":
      return "Explain Li-Fi is temporarily rate limiting. Suggest waiting a few seconds before retrying cross_chain_quote or cross_chain_status.";
    case "RATE_LIMITED":
      return "Explain cross-chain execution is temporarily rate limited. Suggest waiting before retrying Approve on the same pending transaction.";
    case "LIFI_NO_ROUTE":
      return "Explain no bridge route exists for this token pair or amount. Suggest a different amount, token, or enabled EVM chain pair.";
    case "LIFI_VALIDATION_ERROR":
      return "Explain the Li-Fi request params were invalid or the quote expired. Re-run cross_chain_quote with correct from_address and chain ids.";
    case "LIFI_UNAVAILABLE":
      return "Explain Li-Fi is temporarily unavailable. Suggest retrying shortly.";
    case "SQUID_RATE_LIMITED":
      return "Explain Squid is temporarily rate limiting. Suggest waiting a few seconds before retrying the alternate route.";
    case "SQUID_NO_ROUTE":
      return "Explain no alternate bridge route exists for this token pair or amount. Suggest a different amount, token, or enabled chain pair.";
    case "SQUID_VALIDATION_ERROR":
      return "Explain the alternate route request params were invalid or the quote expired. Re-run cross_chain_quote after correcting params.";
    case "SQUID_UNAVAILABLE":
      return "Explain the alternate route provider is temporarily unavailable. Suggest retrying shortly or choosing a different transfer.";
    case "SOROSWAP_ROUTE_NOT_FOUND":
      return "Explain no Stellar liquidity exists for this pair or amount. Suggest a smaller amount, adjust slippage, or confirm XLM/USDC on Stellar. Do not call Li-Fi or Squid for Stellar same-chain swaps.";
    case "SOROSWAP_VALIDATION_ERROR":
      return "Re-run stellar_swap_quote with corrected stroops amount, allowlisted symbols, and trade_type.";
    case "SOROSWAP_UNAUTHORIZED":
      return "Operator misconfiguration — do not retry in a loop. Suggest trying again later.";
    case "SOROSWAP_RATE_LIMITED":
      return "Wait a few seconds, then retry stellar_swap_quote once.";
    case "SOROSWAP_UNAVAILABLE":
      return "Retry shortly; if persistent, stop and explain the Stellar swap service is unavailable.";
    case "SOROSWAP_QUOTE_EXPIRED":
      return "Re-run stellar_swap_quote before stellar_swap; never reuse a stale quote_id.";
    case "APPROVAL_FAILED":
      return "Explain the ERC-20 approval transaction failed. Suggest checking gas and retrying lifi_approve or cross_chain_swap.";
    case "CHAIN_NOT_ENABLED":
      return "Explain the requested chain or EVM network is not enabled on this deployment. List enabled chains if known from context.";
    case "CHAIN_NOT_SUPPORTED":
      return "Explain the chain id is not supported. Suggest using an enabled chain from the Radiant allowlist.";
    case "TRANSACTION_ERROR":
    case "TRANSACTION_FAILED":
      return "Explain the transaction failed on chain in plain language.";
    case "INVALID_PUBLIC_KEY":
    case "WALLET_METADATA_MISSING":
    case "SIGNING_FAILED":
    case "STELLAR_SIGNING_FAILED":
      return "Explain there was a wallet signing issue and suggest reconnecting or re-registering the agent wallet.";
    case "VALIDATION_ERROR":
      return "Explain which param was wrong in plain language. For deepbook_flash_loan / flash_loan_quote: pool_key is the borrow pool; asset must be base or quote; swap_chain_repay steps are optional (auto-routed when omitted). Fix params and retry the tool — do not ask the user to confirm in chat when details are already in the thread.";
    default:
      return "Explain what went wrong in plain language and suggest a practical next step.";
  }
}

/** @deprecated Use toolErrorToModelContent for model-facing tool results. */
export function formatAgentToolErrorMessage(err: AppError): string {
  return toolErrorToModelContent({
    code: err.code,
    message: err.message,
    details: err.details,
  });
}

export function isBase58Encoded(value: string): boolean {
  return BASE58_ALPHABET.test(value);
}
