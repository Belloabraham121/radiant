import type { ExecuteTransactionInput } from "../../../chains/types.js";
import { enrichDeepBookSwapExecuteInputForApproval } from "./deepbook.js";
import { enrichLifiExecuteInputForApproval } from "./lifi.js";

type ApprovalEnricher = {
  enrich: (privyUserId: string, input: ExecuteTransactionInput) => Promise<ExecuteTransactionInput>;
};

const APPROVAL_ENRICHERS: readonly ApprovalEnricher[] = [
  { enrich: enrichDeepBookSwapExecuteInputForApproval },
  { enrich: enrichLifiExecuteInputForApproval },
];

/** Run provider-specific enrichers to attach fresh quote metadata before approval UI. */
export async function enrichExecuteInputForApproval(
  privyUserId: string,
  input: ExecuteTransactionInput,
): Promise<ExecuteTransactionInput> {
  let enriched = input;
  for (const { enrich } of APPROVAL_ENRICHERS) {
    enriched = await enrich(privyUserId, enriched);
  }
  return enriched;
}
