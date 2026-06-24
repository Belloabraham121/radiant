import { AppError } from "../../errors/app-error.js";
import type { rpc } from "@stellar/stellar-sdk";

function extractResultCode(errorResult: rpc.Api.SendTransactionResponse["errorResult"]): string | undefined {
  if (!errorResult) {
    return undefined;
  }

  try {
    const results = errorResult.result().results();
    const first = results[0];
    const tr = first?.tr();
    if (!tr) {
      return undefined;
    }
    if (tr.switch().name === "txFailed") {
      return tr.txFailed().at(0)?.value()?.name;
    }
    return tr.value()?.name;
  } catch {
    return undefined;
  }
}

/** Map Soroban simulation / Horizon submit failures to AppErrors. */
export function mapStellarSimulationError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }

  const message = err instanceof Error ? err.message : String(err);
  const resultCode = /result_code[s]?\s*[=:]\s*(\w+)/i.exec(message)?.[1];

  if (/op_no_trust|trustline/i.test(message)) {
    return new AppError(
      400,
      "INSUFFICIENT_BALANCE",
      "Missing trustline for this asset. Open a trustline first or use a gasless trustline flow when available.",
      { cause: message, stellar_code: resultCode ?? "op_no_trust" },
    );
  }

  if (/insufficient|underfunded|not enough.*xlm|below.*reserve/i.test(message)) {
    return new AppError(
      400,
      "INSUFFICIENT_BALANCE",
      "Insufficient XLM balance for network fees or payment.",
      { cause: message, stellar_code: resultCode },
    );
  }

  if (/tx_failed|tx_too_early|tx_too_late|tx_bad_auth/i.test(message)) {
    return new AppError(502, "TRANSACTION_FAILED", "Stellar transaction simulation failed.", {
      cause: message,
      excerpt: message.slice(0, 300),
      stellar_code: resultCode ?? "tx_failed",
    });
  }

  return new AppError(502, "TRANSACTION_FAILED", message.slice(0, 500), {
    cause: message,
    excerpt: message.slice(0, 300),
    stellar_code: resultCode,
  });
}

/** Map Soroban `sendTransaction` ERROR responses. */
export function mapStellarSubmitError(response: rpc.Api.SendTransactionResponse): AppError {
  const resultCode = extractResultCode(response.errorResult);
  const details: Record<string, unknown> = {
    stellar_code: resultCode,
    status: response.status,
    hash: response.hash,
  };

  if (resultCode && /no_trust|trustline/i.test(resultCode)) {
    return new AppError(
      400,
      "INSUFFICIENT_BALANCE",
      "Missing trustline for this asset. Open a trustline first or use a gasless trustline flow when available.",
      details,
    );
  }

  if (resultCode && /underfunded|insufficient/i.test(resultCode)) {
    return new AppError(
      400,
      "INSUFFICIENT_BALANCE",
      "Insufficient XLM balance for network fees or payment.",
      details,
    );
  }

  return new AppError(502, "TRANSACTION_FAILED", "Stellar transaction submission failed.", {
    ...details,
    excerpt: (resultCode ?? response.status).slice(0, 300),
  });
}
