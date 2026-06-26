import type { ExecuteTransactionInput } from "../../../chains/types.js";
import type { LiquidityFallbackOffer } from "../../../defi/cross-chain/cross-chain.types.js";
import { enrichDeepBookSwapExecuteInputForApproval } from "./deepbook.js";
import {
  enrichCrossChainExecuteInputForApproval,
  matchCrossChainExecuteInput,
} from "./cross-chain.js";

export type EnrichExecuteInputForApprovalResult =
  | { kind: "enriched"; input: ExecuteTransactionInput }
  | {
      kind: "liquidity_fallback_offered";
      input: ExecuteTransactionInput;
      liquidity_fallback_offer: LiquidityFallbackOffer;
    };

type ApprovalEnricher = {
  match: (input: ExecuteTransactionInput) => boolean;
  enrich: (
    privyUserId: string,
    input: ExecuteTransactionInput,
    options?: import("./enrichers/cross-chain.js").CrossChainEnrichOptions,
  ) => Promise<EnrichExecuteInputForApprovalResult>;
};

const APPROVAL_ENRICHERS: readonly ApprovalEnricher[] = [
  {
    match: matchCrossChainExecuteInput,
    enrich: enrichCrossChainExecuteInputForApproval,
  },
  {
    match: () => true,
    enrich: async (privyUserId, input, _options?) => ({
      kind: "enriched",
      input: await enrichDeepBookSwapExecuteInputForApproval(privyUserId, input),
    }),
  },
];

/** Run provider-specific enrichers to attach fresh quote metadata before approval UI. */
export async function enrichExecuteInputForApproval(
  privyUserId: string,
  input: ExecuteTransactionInput,
  options?: import("./enrichers/cross-chain.js").CrossChainEnrichOptions,
): Promise<EnrichExecuteInputForApprovalResult> {
  for (const { match, enrich } of APPROVAL_ENRICHERS) {
    if (match(input)) {
      return enrich(privyUserId, input, options);
    }
  }
  return { kind: "enriched", input };
}
