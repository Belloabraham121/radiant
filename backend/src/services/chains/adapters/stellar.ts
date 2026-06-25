import type { Wallet } from "@privy-io/node";
import { getPrivyClient } from "../../../infrastructure/privy/client.js";
import { getHorizonServer } from "../../../infrastructure/stellar/client.js";
import { withStellarRpcRetry } from "../../../infrastructure/stellar/rpc-retry.js";
import { AppError } from "../../../errors/app-error.js";
import { stroopsToXlm, xlmBalanceStringToStroops } from "../../../utils/stellar-amount.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import {
  buildTransferNativeTransaction,
  executeSignedStellarTransaction,
  parseTransactionXdr,
  type StellarTxResult,
} from "../../wallet/stellar-transaction.service.js";
import { stellarAddressSchema } from "../../wallet/wallet.types.js";
import type { ChainAdapter, TxResult } from "../types.js";
import { toStellarBalanceResult } from "./stellar-balance.js";

async function fetchPrivyStellarWallet(privyWalletId: string): Promise<Wallet> {
  const wallet = await getPrivyClient().wallets().get(privyWalletId);
  if (wallet.chain_type !== "stellar") {
    throw new AppError(400, "INVALID_WALLET", "Agent wallet is not a Stellar wallet");
  }
  return wallet;
}

async function resolveSigningWallet(privyUserId: string) {
  const agentWallet = await resolveAgentWalletByPrivyUserId(privyUserId, "stellar");
  if (!agentWallet) {
    throw new AppError(404, "WALLET_NOT_FOUND", "Stellar agent wallet not registered");
  }
  if (!agentWallet.signer_added) {
    throw new AppError(
      403,
      "WALLET_SIGNER_NOT_CONFIGURED",
      "Session signer has not been added to the agent wallet",
    );
  }

  const privyWallet = await fetchPrivyStellarWallet(agentWallet.privy_wallet_id);
  if (privyWallet.address !== agentWallet.address) {
    throw new AppError(
      409,
      "WALLET_ADDRESS_MISMATCH",
      "Privy wallet address does not match the registered agent wallet",
    );
  }

  return agentWallet;
}

function parseRecipient(params: Record<string, unknown>): string {
  const recipient = params.recipient ?? params.destination;
  if (typeof recipient !== "string" || !stellarAddressSchema.safeParse(recipient).success) {
    throw new AppError(400, "VALIDATION_ERROR", "params.recipient must be a valid Stellar address");
  }
  return recipient;
}

function parseAmountStroops(params: Record<string, unknown>): bigint {
  const raw = params.amount_stroops ?? params.amount_atomic;
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "params.amount_stroops (or amount_atomic) must be a positive integer string",
    );
  }
  return BigInt(raw);
}

function parseTransactionXdrParam(params: Record<string, unknown>): string {
  const raw = params.transaction_xdr ?? params.unsigned_xdr ?? params.xdr;
  if (typeof raw !== "string" || raw.length === 0) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "params.transaction_xdr (or unsigned_xdr) is required",
    );
  }
  return raw;
}

function toTxResult(result: StellarTxResult): TxResult {
  return {
    chain_id: "stellar",
    digest: result.hash,
    address: result.stellar_address,
    effects_status: result.effects_status,
  };
}

export async function getStellarAdapterBalance(stellarAddress: string) {
  const horizon = getHorizonServer();
  try {
    const account = await withStellarRpcRetry(() => horizon.loadAccount(stellarAddress));
    const native = account.balances.find((entry) => entry.asset_type === "native");
    const balanceStroops = xlmBalanceStringToStroops(native?.balance ?? "0");

    return toStellarBalanceResult({
      address: stellarAddress,
      balanceStroops,
      balanceXlm: stroopsToXlm(balanceStroops),
      funded: balanceStroops > 0n,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not found|404/i.test(message)) {
      return toStellarBalanceResult({
        address: stellarAddress,
        balanceStroops: 0n,
        balanceXlm: 0,
        funded: false,
      });
    }
    throw err;
  }
}

export async function executeStellarTransaction(
  privyUserId: string,
  action: string,
  params: Record<string, unknown>,
): Promise<StellarTxResult> {
  const agentWallet = await resolveSigningWallet(privyUserId);

  switch (action) {
    case "transfer_native":
    case "transfer_xlm": {
      const transaction = await buildTransferNativeTransaction({
        sourceAddress: agentWallet.address,
        recipient: parseRecipient(params),
        amountStroops: parseAmountStroops(params),
      });
      return executeSignedStellarTransaction({
        privyWalletId: agentWallet.privy_wallet_id,
        stellarAddress: agentWallet.address,
        transaction,
      });
    }
    case "execute_xdr":
    case "submit_xdr": {
      const transaction = parseTransactionXdr(parseTransactionXdrParam(params));
      return executeSignedStellarTransaction({
        privyWalletId: agentWallet.privy_wallet_id,
        stellarAddress: agentWallet.address,
        transaction,
        simulate: params.simulate !== false,
      });
    }
    default:
      throw new AppError(400, "UNSUPPORTED_ACTION", `Unsupported Stellar action: ${action}`);
  }
}

export const stellarAdapter: ChainAdapter = {
  chainId: "stellar",

  async getBalance(address: string) {
    return getStellarAdapterBalance(address);
  },

  async executeTransaction(
    privyUserId: string,
    action: string,
    params: Record<string, unknown>,
  ): Promise<TxResult> {
    const result = await executeStellarTransaction(privyUserId, action, params);
    return toTxResult(result);
  },
};
