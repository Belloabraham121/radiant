import { AppError } from "../../errors/app-error.js";
import { getAdapter } from "../chains/registry.js";
import { getWalletAssetsForPrivyUser } from "../wallet/wallet-assets.service.js";
import { resolveAgentWalletByPrivyUserId } from "../wallet/agent-wallet.service.js";
import type { BalanceContext } from "../chains/types.js";
import {
  queryChainInputSchema,
  type QueryChainInput,
  type QueryChainResult,
} from "./agent.types.js";

export const QUERY_CHAIN_TOOL_NAME = "query_chain" as const;

export const queryChainToolDefinition = {
  name: QUERY_CHAIN_TOOL_NAME,
  description:
    "Read-only chain queries for the authenticated user's agent wallet. " +
    "Wallet address is resolved from session — never pass wallet addresses.",
  input_schema: {
    type: "object" as const,
    properties: {
      chain_id: {
        type: "string",
        enum: ["sui", "ethereum", "solana"],
        description: "Target chain (must be enabled for this app).",
      },
      query: {
        type: "string",
        enum: ["balance", "native_balance", "token_balances"],
        description:
          "Read-only query type: native balance or multi-token wallet holdings (Sui: SUI, USDC, DEEP, …).",
      },
      params: {
        type: "object",
        description: "Optional query params. EVM: { evm_chain_id }.",
        additionalProperties: true,
      },
    },
    required: ["chain_id", "query"] as const,
    additionalProperties: false,
  },
};

export async function runQueryChainTool(
  privyUserId: string,
  input: QueryChainInput,
): Promise<QueryChainResult> {
  const parsed = queryChainInputSchema.parse(input);
  const wallet = await resolveAgentWalletByPrivyUserId(privyUserId, parsed.chain_id);

  if (!wallet) {
    throw new AppError(
      404,
      "WALLET_NOT_FOUND",
      `No agent wallet registered for chain "${parsed.chain_id}".`,
    );
  }

  const context: BalanceContext | undefined =
    parsed.chain_id === "ethereum" && parsed.params.evm_chain_id !== undefined
      ? { evm_chain_id: parsed.params.evm_chain_id }
      : undefined;

  const adapter = getAdapter(parsed.chain_id);

  switch (parsed.query) {
    case "balance":
    case "native_balance":
      return adapter.getBalance(wallet.address, context);
    case "token_balances":
      return getWalletAssetsForPrivyUser(privyUserId, {
        chain_id: parsed.chain_id,
        evm_chain_id: parsed.params.evm_chain_id,
        include_zero: parsed.params.include_zero,
        include_usd: parsed.params.include_usd,
      });
    default:
      throw new AppError(400, "UNSUPPORTED_QUERY", `Unsupported query: ${parsed.query}`);
  }
}
