import { AppError } from "../errors/app-error.js";

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
      "Your agent wallet does not hold enough of the token needed for this transaction.",
      { cause: message },
    );
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
      return "Explain the wallet lacks enough of the required token. Suggest funding the agent wallet or using a smaller amount.";
    case "SLIPPAGE_EXCEEDED":
      return "Explain the swap could not complete due to price movement. Suggest a smaller amount or higher slippage.";
    case "TRANSACTION_ERROR":
    case "TRANSACTION_FAILED":
      return "Explain the transaction failed on chain in plain language.";
    case "INVALID_PUBLIC_KEY":
    case "WALLET_METADATA_MISSING":
    case "SIGNING_FAILED":
      return "Explain there was a wallet signing issue and suggest reconnecting or re-registering the agent wallet.";
    case "VALIDATION_ERROR":
      return "Explain the transaction params were incomplete. For deepbook_deposit include coin_key and amount_display (positive number). Retry the tool call with correct params — do not ask the user to confirm in chat.";
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
