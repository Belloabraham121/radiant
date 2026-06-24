import { AppError } from "../../../../../errors/app-error.js";
import { executeLifiApproval, checkLifiApprovalRequired } from "../../../../defi/lifi/lifi-approval.service.js";
import { executeLifiCrossChainSwap } from "../../../../defi/lifi/lifi-execute.service.js";
import { resolveLifiRouteForExecute } from "../../../../defi/lifi/lifi-quote.service.js";
import { lifiExecuteInputSchema } from "../../../../defi/lifi/lifi.types.js";
import type { ExecuteTransactionInput } from "../../../../chains/types.js";

export const LIFI_EXECUTE_ACTIONS = ["cross_chain_swap", "lifi_approve"] as const;

export const LIFI_EXECUTE_SCHEMA = {
  actionDescription: "cross_chain_swap, lifi_approve (Li-Fi cross-chain).",
  paramsDescription:
    "cross_chain_swap: { route_id } or { route } from cross_chain_quote / cross_chain_routes; re-validates quote at execute. " +
    "lifi_approve: { route_id | route } — optional separate ERC-20 approval before cross_chain_swap.",
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
