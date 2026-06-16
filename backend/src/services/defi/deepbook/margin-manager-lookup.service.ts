import { AppError } from "../../../errors/app-error.js";
import { listAgentTransactionsForUser } from "../../agent-transaction/agent-transaction.repository.js";
import { findUserByPrivyId } from "../../auth/user.repository.js";
import { getDeepBookClient } from "./providers/sui-deepbook.provider.js";

const DEFAULT_RETRIES = 3;
const RETRY_DELAY_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableRpcError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /fetch failed|timeout|ECONNRESET|ETIMEDOUT|network|503|502/i.test(message);
}

export function extractMarginManagerAddressFromTxResult(result: unknown): string | null {
  if (typeof result !== "object" || result === null) {
    return null;
  }
  const margin = (result as { deepbook?: { margin?: { margin_manager?: unknown } } }).deepbook
    ?.margin?.margin_manager;
  if (typeof margin === "string" && margin.startsWith("0x")) {
    return margin;
  }
  return null;
}

/** On-chain margin manager IDs for an owner, with retries for flaky Sui RPC. */
export async function fetchMarginManagerIdsForOwner(
  walletAddress: string,
  options?: { retries?: number },
): Promise<string[]> {
  const retries = options?.retries ?? DEFAULT_RETRIES;
  const client = getDeepBookClient({ address: walletAddress });
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await client.getMarginManagerIdsForOwner(walletAddress);
    } catch (err) {
      lastError = err;
      if (attempt < retries - 1 && isRetryableRpcError(err)) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Last known margin manager address from executed agent transactions (fallback when RPC fails). */
export async function findMarginManagerFromAgentLedger(
  privyUserId: string,
): Promise<string | null> {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    return null;
  }

  const { items } = await listAgentTransactionsForUser({
    user_id: user.id,
    chain_id: "sui",
    status: "success",
    skip: 0,
    take: 25,
  });

  for (const row of items) {
    if (
      !row.action.includes("margin") &&
      row.action !== "deepbook_provision_margin_manager"
    ) {
      continue;
    }
    const fromResult = extractMarginManagerAddressFromTxResult(row.result);
    if (fromResult) {
      return fromResult;
    }
  }

  return null;
}

export type MarginManagerLookupResult = {
  margin_manager_ids: string[];
  source: "on_chain" | "agent_ledger_fallback";
  rpc_warning?: string;
};

export async function resolveMarginManagerIdsForUser(
  privyUserId: string,
  walletAddress: string,
): Promise<MarginManagerLookupResult> {
  try {
    const ids = await fetchMarginManagerIdsForOwner(walletAddress);
    return { margin_manager_ids: ids, source: "on_chain" };
  } catch (rpcErr) {
    const fromLedger = await findMarginManagerFromAgentLedger(privyUserId);
    if (fromLedger) {
      return {
        margin_manager_ids: [fromLedger],
        source: "agent_ledger_fallback",
        rpc_warning: rpcErr instanceof Error ? rpcErr.message : String(rpcErr),
      };
    }

    throw new AppError(
      503,
      "SUI_RPC_UNAVAILABLE",
      "Could not reach Sui RPC to look up your margin manager. Try again in a moment.",
      { cause: rpcErr instanceof Error ? rpcErr.message : String(rpcErr) },
    );
  }
}
