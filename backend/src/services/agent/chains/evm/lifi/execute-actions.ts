import { AppError } from "../../../../../errors/app-error.js";
import { executeLifiApproval, checkLifiApprovalRequired } from "../../../../defi/lifi/lifi-approval.service.js";
import { executeLifiCrossChainSwap } from "../../../../defi/lifi/lifi-execute.service.js";
import { resolveLifiRouteForExecute } from "../../../../defi/lifi/lifi-quote.service.js";
import { lifiExecuteInputSchema } from "../../../../defi/lifi/lifi.types.js";
import type { ExecuteTransactionInput } from "../../../../chains/types.js";

export const LIFI_EXECUTE_ACTIONS = ["cross_chain_swap", "lifi_approve"] as const;

export const LIFI_EXECUTE_SCHEMA = {
  actionDescription: "cross_chain_swap, lifi_approve (Li-Fi cross-chain). IMPORTANT: cross_chain_swap does NOT broadcast immediately — it queues an approval dialog for the user to review and confirm. Always call it after a successful route quote.",
  paramsDescription:
    "cross_chain_swap: { route_id (required), from_token, to_token, from_token_symbol, to_token_symbol, from_amount_atomic, to_amount_atomic, from_chain_id, to_chain_id, from_evm_chain_id, to_evm_chain_id, bridges, fee_cost_usd, expires_at } — route_id plus snapshot fields from cross_chain_routes/cross_chain_quote are required. The server persists the full route at approval-create time; snapshot fields ensure the approval dialog shows pay/receive amounts and countdown, and allow re-quote if the ephemeral route cache expires before the user approves. Do NOT echo the large lifi_route/route object. " +
    "lifi_approve: { route_id } — optional separate ERC-20 approval before cross_chain_swap.",
};

export async function executeLifiAction(
  privyUserId: string,
  action: string,
  params: Record<string, unknown>,
) {
  switch (action) {
    case "cross_chain_swap": {
      const parsed = lifiExecuteInputSchema.parse(params);
      return executeLifiCrossChainSwap(privyUserId, { ...params, ...parsed });
    }
    case "lifi_approve": {
      const parsed = lifiExecuteInputSchema.parse(params);
      const input = { ...params, ...parsed };
      const route = await resolveLifiRouteForExecute({
        routeId: input.route_id,
        route: input.route,
        lifiRoute: input.lifi_route,
        privyUserId,
        snapshotParams: input,
      });
      const approvalInfo = await checkLifiApprovalRequired(route);
      if (!approvalInfo.chainId) {
        return {
          required: false,
          effects_status: "skipped" as const,
        };
      }
      return executeLifiApproval(privyUserId, {
        route,
        evmChainId: approvalInfo.chainId,
      });
    }
    default:
      throw new AppError(400, "UNSUPPORTED_ACTION", `Unsupported Li-Fi action: ${action}`);
  }
}

export function isLifiExecuteAction(action: string): boolean {
  return (LIFI_EXECUTE_ACTIONS as readonly string[]).includes(action);
}

export type LifiExecuteContext = {
  privyUserId: string;
  input: ExecuteTransactionInput;
};
