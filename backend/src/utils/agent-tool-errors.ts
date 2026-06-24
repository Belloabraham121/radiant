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

  if (/insufficient\s*balance|insufficientcoinbalance|not enough\s+\w+/i.test(message)) {
    return new AppError(
      400,
      "INSUFFICIENT_BALANCE",
      "You do not have enough of the required token to complete this transaction.",
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
      return "Explain the wallet lacks enough of the required token or SUI for network gas. Suggest funding the agent wallet or using a smaller amount.";
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
      return "Explain which param was wrong in plain language. For generate_app: name must be a string, files must be an array of { path, content } objects (include app/page.tsx). For deepbook_flash_loan / flash_loan_quote: pool_key is the borrow pool; asset must be base or quote; swap_chain_repay steps are optional (auto-routed when omitted). Fix params and retry the tool — do not ask the user to confirm in chat when details are already in the thread.";
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
