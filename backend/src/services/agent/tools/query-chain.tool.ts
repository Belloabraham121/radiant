import { AppError } from "../../../errors/app-error.js";
import { getEnabledChainConfigs } from "../../../config/chains.js";
import type { BalanceContext } from "../../chains/types.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import { getAgentPermissions } from "../agent-permissions.service.js";
import { resolveQueryHandler, resolveQueryTypes } from "../chains/registry.js";
import type { AgentToolOptions } from "../execute-transaction-context.js";
import {
  queryChainInputSchema,
  type QueryChainInput,
  type QueryChainResult,
} from "../agent.types.js";
import { buildQueryChainToolDefinition } from "./build-tool-definitions.js";
import { staticToolDefinitionsContext } from "./build-tool-definitions.js";

export { QUERY_CHAIN_TOOL_NAME } from "./build-tool-definitions.js";

/** @deprecated Use `buildQueryChainToolDefinition(context)` for dynamic schemas. */
export const queryChainToolDefinition = buildQueryChainToolDefinition(
  staticToolDefinitionsContext(),
);

export async function runQueryChainTool(
  privyUserId: string,
  input: QueryChainInput,
  options?: Pick<AgentToolOptions, "flashLoanTurnIntent" | "sessionId" | "pinnedAppScope">,
): Promise<QueryChainResult> {
  const parsed = queryChainInputSchema.parse(input);
  const wallet = await resolveAgentWalletByPrivyUserId(
    privyUserId,
    parsed.chain_id,
  );

  if (!wallet) {
    throw new AppError(
      404,
      "WALLET_NOT_FOUND",
      `No agent wallet registered for chain "${parsed.chain_id}".`,
    );
  }

  const balanceContext: BalanceContext | undefined =
    parsed.chain_id === "ethereum" && parsed.params.evm_chain_id !== undefined
      ? { evm_chain_id: parsed.params.evm_chain_id }
      : undefined;

  const enabledChains = getEnabledChainConfigs().map((config) => config.id);
  const permissions = await getAgentPermissions(privyUserId);
  const allowedQueries = new Set(
    resolveQueryTypes({ enabledChains, permissions }),
  );

  if (!allowedQueries.has(parsed.query)) {
    throw new AppError(
      400,
      "UNSUPPORTED_QUERY",
      "That query isn't available for your account.",
    );
  }

  const handler = resolveQueryHandler(parsed.chain_id, parsed.query);
  if (!handler) {
    throw new AppError(
      400,
      "UNSUPPORTED_QUERY",
      "That query isn't supported on this chain.",
    );
  }

  return handler({
    privyUserId,
    chainId: parsed.chain_id,
    query: parsed.query,
    params: parsed.params,
    walletAddress: wallet.address,
    balanceContext,
    options,
  });
}
