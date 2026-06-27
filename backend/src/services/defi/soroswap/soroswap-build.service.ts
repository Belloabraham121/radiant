import { isSoroswapEnabled } from "../../../config/soroswap.js";
import { AppError } from "../../../errors/app-error.js";
import { mapSoroswapExecuteError } from "./soroswap.errors.js";
import { resolveSoroswapQuoteForExecute } from "./soroswap-quote-store.service.js";
import { soroswapRestFetch } from "./soroswap.client.js";
import {
  soroswapBuildResponseSchema,
  type SoroswapBuildRequest,
} from "./soroswap.types.js";
import { resolveSoroswapWalletAddress } from "./soroswap-wallet-addresses.js";

export type SoroswapBuildInput = {
  quoteId: string;
  routeId?: string;
  fromAddress?: string;
  snapshotParams?: Record<string, unknown>;
};

export type SoroswapBuildResult = {
  xdr: string;
};

type ParseXdrFn = (xdr: string) => unknown;
type SimulateFn = (transaction: unknown) => Promise<void>;

let parseXdrForTests: ParseXdrFn | null = null;
let simulateForTests: SimulateFn | null = null;

/** Test hooks — bypass Stellar RPC in unit tests. */
export function setSoroswapBuildStellarHooksForTests(hooks: {
  parseXdr?: ParseXdrFn | null;
  simulate?: SimulateFn | null;
} | null): void {
  parseXdrForTests = hooks?.parseXdr ?? null;
  simulateForTests = hooks?.simulate ?? null;
}

async function parseBuiltXdrAsync(xdr: string): Promise<unknown> {
  if (parseXdrForTests) {
    return parseXdrForTests(xdr);
  }
  const { parseTransactionXdr } = await import("../../wallet/stellar-transaction.service.js");
  return parseTransactionXdr(xdr);
}

async function simulateBuiltTransaction(transaction: unknown): Promise<void> {
  if (simulateForTests) {
    await simulateForTests(transaction);
    return;
  }
  const { simulateStellarTransaction } = await import("../../wallet/stellar-transaction.service.js");
  await simulateStellarTransaction(transaction as never);
}

/**
 * Build unsigned Stellar XDR from a stored Soroswap quote (`POST /quote/build`) and simulate.
 */
export async function buildSoroswapTransaction(
  privyUserId: string,
  input: SoroswapBuildInput,
): Promise<SoroswapBuildResult> {
  if (!isSoroswapEnabled()) {
    throw new AppError(503, "SOROSWAP_UNAVAILABLE", "Stellar swap service is temporarily unavailable.");
  }

  const quoteId = input.quoteId?.trim();
  if (!quoteId) {
    throw new AppError(400, "VALIDATION_ERROR", "quoteId is required.", { field: "quoteId" });
  }

  const stored = await resolveSoroswapQuoteForExecute({
    quoteId,
    routeId: input.routeId,
    snapshotParams: input.snapshotParams,
    privyUserId,
  });

  const fromAddress = await resolveSoroswapWalletAddress(privyUserId, input.fromAddress);

  const buildRequest: SoroswapBuildRequest = {
    quote: stored.quote,
    from: fromAddress,
  };

  try {
    const raw = await soroswapRestFetch<unknown>("/quote/build", {
      method: "POST",
      body: buildRequest,
    });
    const parsed = soroswapBuildResponseSchema.parse(raw);
    const transaction = await parseBuiltXdrAsync(parsed.xdr);
    await simulateBuiltTransaction(transaction);
    return { xdr: parsed.xdr };
  } catch (err) {
    throw mapSoroswapExecuteError(err);
  }
}
