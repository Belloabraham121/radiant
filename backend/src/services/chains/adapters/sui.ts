import type { Wallet } from "@privy-io/node";
import { getPrivyClient } from "../../../infrastructure/privy/client.js";
import { getSuiClient } from "../../../infrastructure/sui/client.js";
import { AppError } from "../../../errors/app-error.js";
import { mistToSui, SUI_COIN_TYPE } from "../../../utils/sui-amount.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import { signSuiTransactionBytes } from "../../wallet/sui-signing.service.js";
import {
  buildTransferSuiTransaction,
  executeSignedSuiTransaction,
} from "../../wallet/sui-transaction.service.js";
import type { ChainBalance, SuiExecuteAction, SuiTxResult } from "../types.js";

export async function getSuiAdapterBalance(suiAddress: string): Promise<ChainBalance> {
  const client = getSuiClient();
  const { balance } = await client.getBalance({
    owner: suiAddress,
    coinType: SUI_COIN_TYPE,
  });
  const balanceMist = BigInt(balance.balance);

  return {
    address: suiAddress,
    balanceMist,
    balanceSui: mistToSui(balanceMist),
    funded: balanceMist > 0n,
    coinType: SUI_COIN_TYPE,
  };
}

async function fetchPrivySuiWallet(privyWalletId: string): Promise<Wallet> {
  const wallet = await getPrivyClient().wallets().get(privyWalletId);
  if (wallet.chain_type !== "sui") {
    throw new AppError(400, "INVALID_WALLET", "Agent wallet is not a Sui wallet");
  }
  if (!wallet.public_key) {
    throw new AppError(
      502,
      "WALLET_METADATA_MISSING",
      "Privy Sui wallet is missing a public key — cannot serialize signatures",
    );
  }
  return wallet;
}

async function resolveSigningWallet(privyUserId: string) {
  const agentWallet = await resolveAgentWalletByPrivyUserId(privyUserId);
  if (!agentWallet) {
    throw new AppError(404, "WALLET_NOT_FOUND", "Agent wallet not registered");
  }
  if (!agentWallet.signer_added) {
    throw new AppError(
      403,
      "WALLET_SIGNER_NOT_CONFIGURED",
      "Session signer has not been added to the agent wallet",
    );
  }

  const privyWallet = await fetchPrivySuiWallet(agentWallet.privy_wallet_id);
  if (privyWallet.address !== agentWallet.sui_address) {
    throw new AppError(
      409,
      "WALLET_ADDRESS_MISMATCH",
      "Privy wallet address does not match the registered agent wallet",
    );
  }

  return { agentWallet, privyWallet };
}

async function buildTransactionBytes(
  sender: string,
  action: SuiExecuteAction,
): Promise<Uint8Array> {
  if (action.action === "execute_bytes") {
    return action.params.transactionBytes;
  }

  return buildTransferSuiTransaction({
    sender,
    recipient: action.params.recipient,
    amountMist: action.params.amountMist,
  });
}

export async function executeSuiTransaction(
  privyUserId: string,
  action: SuiExecuteAction,
): Promise<SuiTxResult> {
  const { agentWallet, privyWallet } = await resolveSigningWallet(privyUserId);
  const transactionBytes = await buildTransactionBytes(agentWallet.sui_address, action);

  const serializedSignature = await signSuiTransactionBytes({
    privyWalletId: agentWallet.privy_wallet_id,
    suiAddress: agentWallet.sui_address,
    publicKeyBase58: privyWallet.public_key!,
    transactionBytes,
  });

  return executeSignedSuiTransaction({
    transactionBytes,
    serializedSignature,
    suiAddress: agentWallet.sui_address,
  });
}

export { SUI_COIN_TYPE, mistToSui } from "../../../utils/sui-amount.js";
