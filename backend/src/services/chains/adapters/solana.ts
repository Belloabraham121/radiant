import type { Wallet } from "@privy-io/node";
import { PublicKey } from "@solana/web3.js";
import { getPrivyClient } from "../../../infrastructure/privy/client.js";
import { getSolanaConnection } from "../../../infrastructure/solana/client.js";
import { AppError } from "../../../errors/app-error.js";
import { lamportsToSol } from "../../../utils/solana-amount.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import {
  parseAmountLamports,
  parseSolanaRecipient,
  sendSolanaTransfer,
  type SolanaTxResult,
} from "../../wallet/solana-transaction.service.js";
import {
  executeLifiAction,
  isLifiExecuteAction,
} from "../../agent/chains/evm/lifi/execute-actions.js";
import type { ChainAdapter, TxResult } from "../types.js";
import { toSolanaBalanceResult } from "./solana-balance.js";

async function fetchPrivySolanaWallet(privyWalletId: string): Promise<Wallet> {
  const wallet = await getPrivyClient().wallets().get(privyWalletId);
  if (wallet.chain_type !== "solana") {
    throw new AppError(400, "INVALID_WALLET", "Agent wallet is not a Solana wallet");
  }
  return wallet;
}

async function resolveSigningWallet(privyUserId: string) {
  const agentWallet = await resolveAgentWalletByPrivyUserId(privyUserId, "solana");
  if (!agentWallet) {
    throw new AppError(404, "WALLET_NOT_FOUND", "Solana agent wallet not registered");
  }
  if (!agentWallet.signer_added) {
    throw new AppError(
      403,
      "WALLET_SIGNER_NOT_CONFIGURED",
      "Session signer has not been added to the agent wallet",
    );
  }

  const privyWallet = await fetchPrivySolanaWallet(agentWallet.privy_wallet_id);
  if (privyWallet.address !== agentWallet.address) {
    throw new AppError(
      409,
      "WALLET_ADDRESS_MISMATCH",
      "Privy wallet address does not match the registered agent wallet",
    );
  }

  return agentWallet;
}

function toTxResult(result: SolanaTxResult): TxResult {
  return {
    chain_id: "solana",
    digest: result.hash,
    address: result.solana_address,
    effects_status: result.effects_status,
  };
}

export async function getSolanaAdapterBalance(solanaAddress: string) {
  const connection = getSolanaConnection();
  const balanceLamports = BigInt(
    await connection.getBalance(new PublicKey(solanaAddress)),
  );

  return toSolanaBalanceResult({
    address: solanaAddress,
    balanceLamports,
    balanceSol: lamportsToSol(balanceLamports),
    funded: balanceLamports > 0n,
  });
}

export async function executeSolanaTransaction(
  privyUserId: string,
  action: string,
  params: Record<string, unknown>,
): Promise<SolanaTxResult> {
  const agentWallet = await resolveSigningWallet(privyUserId);

  switch (action) {
    case "transfer_native":
    case "transfer_sol":
      return sendSolanaTransfer({
        privyWalletId: agentWallet.privy_wallet_id,
        from: agentWallet.address,
        to: parseSolanaRecipient(params),
        amountLamports: parseAmountLamports(params),
      });
    default:
      if (isLifiExecuteAction(action)) {
        const result = await executeLifiAction(privyUserId, action, {
          ...params,
          from_chain_id: "solana",
        });
        const txHash =
          "tx_hashes" in result && Array.isArray(result.tx_hashes) && result.tx_hashes[0]
            ? result.tx_hashes[0]
            : "unknown";
        return {
          hash: txHash,
          solana_address: agentWallet.address,
          effects_status:
            "effects_status" in result && result.effects_status === "success"
              ? "success"
              : "effects_status" in result && result.effects_status === "failure"
                ? "failure"
                : "unknown",
        };
      }
      throw new AppError(400, "UNSUPPORTED_ACTION", `Unsupported Solana action: ${action}`);
  }
}

export const solanaAdapter: ChainAdapter = {
  chainId: "solana",

  async getBalance(address: string) {
    return getSolanaAdapterBalance(address);
  },

  async executeTransaction(
    privyUserId: string,
    action: string,
    params: Record<string, unknown>,
  ): Promise<TxResult> {
    const result = await executeSolanaTransaction(privyUserId, action, params);
    return toTxResult(result);
  },
};
