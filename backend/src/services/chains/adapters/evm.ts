import type { Wallet } from "@privy-io/node";
import { getPrivyClient } from "../../../infrastructure/privy/client.js";
import { getEvmPublicClient } from "../../../infrastructure/evm/client.js";
import { resolveEvmChainId } from "../../../config/evm.js";
import { AppError } from "../../../errors/app-error.js";
import { weiToEth } from "../../../utils/evm-amount.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import {
  parseAmountWei,
  parseEvmChainIdParam,
  parseEvmRecipient,
  sendEvmTransfer,
  type EvmTxResult,
} from "../../wallet/evm-transaction.service.js";
import { executeLifiAction, isLifiExecuteAction } from "../../agent/chains/evm/lifi/execute-actions.js";
import type { BalanceContext, ChainAdapter, TxResult } from "../types.js";
import { toEvmBalanceResult } from "./evm-balance.js";

async function fetchPrivyEthereumWallet(privyWalletId: string): Promise<Wallet> {
  const wallet = await getPrivyClient().wallets().get(privyWalletId);
  if (wallet.chain_type !== "ethereum") {
    throw new AppError(400, "INVALID_WALLET", "Agent wallet is not an EVM wallet");
  }
  return wallet;
}

async function resolveSigningWallet(privyUserId: string) {
  const agentWallet = await resolveAgentWalletByPrivyUserId(privyUserId, "ethereum");
  if (!agentWallet) {
    throw new AppError(404, "WALLET_NOT_FOUND", "EVM agent wallet not registered");
  }
  if (!agentWallet.signer_added) {
    throw new AppError(
      403,
      "WALLET_SIGNER_NOT_CONFIGURED",
      "Session signer has not been added to the agent wallet",
    );
  }

  const privyWallet = await fetchPrivyEthereumWallet(agentWallet.privy_wallet_id);
  if (privyWallet.address !== agentWallet.address) {
    throw new AppError(
      409,
      "WALLET_ADDRESS_MISMATCH",
      "Privy wallet address does not match the registered agent wallet",
    );
  }

  return agentWallet;
}

function toTxResult(result: EvmTxResult): TxResult {
  return {
    chain_id: "ethereum",
    digest: result.hash,
    address: result.evm_address,
    effects_status: result.effects_status,
    evm_chain_id: result.evm_chain_id,
  };
}

export async function getEvmAdapterBalance(
  evmAddress: string,
  evmChainId?: number,
): Promise<ReturnType<typeof toEvmBalanceResult>> {
  const chainId = resolveEvmChainId(evmChainId);
  const client = getEvmPublicClient(chainId);
  const balanceWei = await client.getBalance({ address: evmAddress as `0x${string}` });

  return toEvmBalanceResult({
    address: evmAddress,
    evmChainId: chainId,
    balanceWei,
    balanceEth: weiToEth(balanceWei),
    funded: balanceWei > 0n,
  });
}

export async function executeEvmTransaction(
  privyUserId: string,
  action: string,
  params: Record<string, unknown>,
): Promise<EvmTxResult> {
  const agentWallet = await resolveSigningWallet(privyUserId);
  const evmChainId = parseEvmChainIdParam(params);

  switch (action) {
    case "transfer_native":
    case "transfer_eth":
      return sendEvmTransfer({
        privyWalletId: agentWallet.privy_wallet_id,
        from: agentWallet.address,
        to: parseEvmRecipient(params),
        amountWei: parseAmountWei(params),
        evmChainId,
      });
    default:
      if (isLifiExecuteAction(action)) {
        const result = await executeLifiAction(privyUserId, action, params);
        const txHash =
          "tx_hashes" in result && Array.isArray(result.tx_hashes) && result.tx_hashes[0]
            ? result.tx_hashes[0]
            : "tx_hash" in result && typeof result.tx_hash === "string"
              ? result.tx_hash
              : "0x0";
        return {
          hash: txHash,
          evm_address: agentWallet.address,
          evm_chain_id: evmChainId ?? 1,
          effects_status:
            "effects_status" in result && result.effects_status === "success"
              ? "success"
              : "effects_status" in result && result.effects_status === "failure"
                ? "failure"
                : "unknown",
        };
      }
      throw new AppError(400, "UNSUPPORTED_ACTION", `Unsupported EVM action: ${action}`);
  }
}

export const evmAdapter: ChainAdapter = {
  chainId: "ethereum",

  async getBalance(address: string, context?: BalanceContext) {
    return getEvmAdapterBalance(address, context?.evm_chain_id);
  },

  async executeTransaction(
    privyUserId: string,
    action: string,
    params: Record<string, unknown>,
  ): Promise<TxResult> {
    const result = await executeEvmTransaction(privyUserId, action, params);
    return toTxResult(result);
  },
};
