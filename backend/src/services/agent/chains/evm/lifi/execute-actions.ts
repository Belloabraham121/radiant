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
    "cross_chain_swap: { route_id, from_token, to_token, from_token_symbol, to_token_symbol, from_amount_atomic, to_amount_atomic, from_chain_id, to_chain_id, to_evm_chain_id, bridges, fee_cost_usd, expires_at } — route_id is the ONLY required field; the server already has the full route stored under that id. Pass the lightweight snapshot fields so the approval dialog shows pay/receive amounts and countdown timer. Do NOT try to echo back the large lifi_route/route object — just send route_id. " +
    "lifi_approve: { route_id } — optional separate ERC-20 approval before cross_chain_swap.",
};

export async function executeLifiAction(
  privyUserId: string,
  action: string,
  params: Record<string, unknown>,
) {
  switch (action) {
    case "cross_chain_swap": {
      const input = lifiExecuteInputSchema.parse(params);
      return executeLifiCrossChainSwap(privyUserId, input);
    }
    case "lifi_approve": {
      const input = lifiExecuteInputSchema.parse(params);
      const route = await resolveLifiRouteForExecute({
        routeId: input.route_id,
        route: input.route,
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
