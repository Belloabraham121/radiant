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
import type {
  ChainAdapter,
  ChainBalance,
  SuiExecuteAction,
  SuiTxResult,
  TxResult,
} from "../types.js";
import { toSuiBalanceResult } from "./sui-balance.js";
import {
  executeDeepBookDeposit,
  executeDeepBookWithdraw,
  executeDeepBookProvisionManager,
} from "../../defi/deepbook-balance-manager.service.js";
import {
  executeDeepBookSwap,
  isDeepBookSwapAction,
} from "../../defi/deepbook-swap.service.js";
import {
  executeDeepBookOrderAction,
  isDeepBookOrderAction,
} from "../../defi/deepbook-orders.service.js";

function parseRecipient(params: Record<string, unknown>): string {
  const recipient = params.recipient;
  if (typeof recipient !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(recipient)) {
    throw new AppError(400, "VALIDATION_ERROR", "params.recipient must be a valid Sui address");
  }
  return recipient;
}

function parseAmountMist(params: Record<string, unknown>): bigint {
  const raw = params.amount_mist ?? params.amount_atomic;
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "params.amount_mist (or amount_atomic) must be a positive integer string",
    );
  }
  return BigInt(raw);
}

function parseTransactionBytes(params: Record<string, unknown>): Uint8Array {
  const raw = params.transaction_bytes;
  if (typeof raw !== "string" || raw.length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "params.transaction_bytes is required");
  }

  try {
    const bytes = Uint8Array.from(Buffer.from(raw, "base64"));
    if (bytes.length === 0) {
      throw new Error("empty");
    }
    return bytes;
  } catch {
    throw new AppError(400, "VALIDATION_ERROR", "params.transaction_bytes must be valid base64");
  }
}

function toSuiExecuteAction(action: string, params: Record<string, unknown>): SuiExecuteAction {
  switch (action) {
    case "transfer_sui":
    case "transfer_native":
      return {
        action: "transfer_sui",
        params: {
          recipient: parseRecipient(params),
          amountMist: parseAmountMist(params),
        },
      };
    case "execute_bytes":
      return {
        action: "execute_bytes",
        params: { transactionBytes: parseTransactionBytes(params) },
      };
    default:
      throw new AppError(400, "UNSUPPORTED_ACTION", `Unsupported Sui action: ${action}`);
  }
}

async function getSuiAdapterBalance(suiAddress: string): Promise<ChainBalance> {
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
  if (privyWallet.address !== agentWallet.address) {
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

function toTxResult(result: SuiTxResult): TxResult {
  return {
    chain_id: "sui",
    digest: result.digest,
    address: result.sui_address,
    effects_status: result.effects_status,
  };
}

export async function executeSuiTransaction(
  privyUserId: string,
  action: SuiExecuteAction,
): Promise<SuiTxResult> {
  const { agentWallet, privyWallet } = await resolveSigningWallet(privyUserId);
  const transactionBytes = await buildTransactionBytes(agentWallet.address, action);

  const serializedSignature = await signSuiTransactionBytes({
    privyWalletId: agentWallet.privy_wallet_id,
    suiAddress: agentWallet.address,
    publicKeyBase58: privyWallet.public_key!,
    transactionBytes,
  });

  return executeSignedSuiTransaction({
    transactionBytes,
    serializedSignature,
    suiAddress: agentWallet.address,
  });
}

export const suiAdapter: ChainAdapter = {
  chainId: "sui",

  async getBalance(address: string) {
    const balance = await getSuiAdapterBalance(address);
    return toSuiBalanceResult(balance);
  },

  async executeTransaction(
    privyUserId: string,
    action: string,
    params: Record<string, unknown>,
  ): Promise<TxResult> {
    if (action === "deepbook_provision_manager") {
      const result = await executeDeepBookProvisionManager(privyUserId);
      return {
        chain_id: "sui",
        digest: result.digest,
        address: result.address,
        effects_status: result.effects_status,
        deepbook: {
          manager_object_id: result.manager_object_id,
          already_provisioned: result.already_provisioned,
        },
      };
    }

    if (action === "deepbook_deposit") {
      const result = await executeDeepBookDeposit(privyUserId, params);
      return {
        chain_id: "sui",
        digest: result.digest,
        address: result.address,
        effects_status: result.effects_status,
        deepbook: {
          coin_key: result.coin_key,
          amount_display: result.amount_display,
          manager_object_id: result.manager_object_id,
        },
      };
    }

    if (action === "deepbook_withdraw") {
      const result = await executeDeepBookWithdraw(privyUserId, params);
      return {
        chain_id: "sui",
        digest: result.digest,
        address: result.address,
        effects_status: result.effects_status,
        deepbook: {
          coin_key: result.coin_key,
          amount_display: result.amount_display,
          manager_object_id: result.manager_object_id,
        },
      };
    }

    if (isDeepBookSwapAction(action)) {
      const result = await executeDeepBookSwap(privyUserId, params);
      return {
        chain_id: "sui",
        digest: result.digest,
        address: result.address,
        effects_status: result.effects_status,
        deepbook: {
          swap: {
            pool_key: result.pool_key,
            side: result.side,
            input_coin: result.input_coin,
            output_coin: result.output_coin,
            in_amount_display: result.in_amount_display,
            out_amount_display: result.out_amount_display,
            fee_deep: result.fee_deep,
            price: result.price,
            pay_with_deep: result.pay_with_deep,
          },
        },
      };
    }

    if (isDeepBookOrderAction(action)) {
      const result = await executeDeepBookOrderAction(action, privyUserId, params);

      return {
        chain_id: "sui",
        digest: result.digest,
        address: result.address,
        effects_status: result.effects_status,
        deepbook: {
          order: {
            pool_key: result.pool_key,
            action: result.action,
            order_id: result.order_id,
            client_order_id: result.client_order_id,
            price: result.price,
            quantity: result.quantity,
            is_bid: result.is_bid,
            pay_with_deep: result.pay_with_deep,
            cancelled_count: result.cancelled_count,
          },
        },
      };
    }

    const suiAction = toSuiExecuteAction(action, params);
    const result = await executeSuiTransaction(privyUserId, suiAction);
    return toTxResult(result);
  },
};

export { SUI_COIN_TYPE, mistToSui } from "../../../utils/sui-amount.js";
