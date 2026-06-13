import { z } from "zod";

/** Supported agent-wallet chains. Extend when adding adapters in Phase 8. */
export const CHAIN_IDS = ["sui", "ethereum", "solana"] as const;

export type ChainId = (typeof CHAIN_IDS)[number];

export const chainIdSchema = z.enum(CHAIN_IDS);

export type BalanceContext = {
  /** EVM network id (e.g. 1, 8453) when `chain_id` is `ethereum`. */
  evm_chain_id?: number;
};

export type BalanceResult = {
  chain_id: ChainId;
  address: string;
  /** Smallest native unit as a decimal string (e.g. mist, wei, lamports). */
  balance_atomic: string;
  /** Human-readable native amount (e.g. SUI, ETH). */
  balance_display: number;
  native_symbol: string;
  coin_type?: string;
  funded: boolean;
  /** Set when querying a specific EVM network. */
  evm_chain_id?: number;
};

export type TxResult = {
  chain_id: ChainId;
  digest: string;
  address: string;
  effects_status: "success" | "failure" | "unknown";
  evm_chain_id?: number;
  deepbook?: {
    coin_key?: string;
    amount_display?: number;
    manager_object_id?: string;
    already_provisioned?: boolean;
    swap?: {
      pool_key: string;
      side: "buy" | "sell";
      input_coin: string;
      output_coin: string;
      in_amount_display: number;
      out_amount_display: number;
      fee_deep: number | null;
      price: number | null;
      pay_with_deep?: boolean;
    };
    order?: {
      pool_key: string;
      action: string;
      order_id?: string;
      client_order_id?: number;
      price?: number;
      quantity?: number;
      is_bid?: boolean;
      pay_with_deep?: boolean;
      cancelled_count?: number;
    };
    flash_loan?: {
      pool_key: string;
      borrow_amount: number;
      coin_key: string;
      asset: "base" | "quote";
      strategy: "round_trip";
    };
  };
};

export type ExecuteTransactionInput = {
  chain_id: ChainId;
  action: string;
  params: Record<string, unknown>;
};

export const executeTransactionInputSchema = z.object({
  chain_id: chainIdSchema,
  action: z.string().min(1),
  params: z.record(z.unknown()),
});

export type ExecuteTransactionInputParsed = z.infer<typeof executeTransactionInputSchema>;

/**
 * Chain-agnostic interface — routes and agent tools call this, never chain SDKs directly.
 */
export interface ChainAdapter {
  readonly chainId: ChainId;
  getBalance(address: string, context?: BalanceContext): Promise<BalanceResult>;
  executeTransaction(
    privyUserId: string,
    action: string,
    params: Record<string, unknown>,
  ): Promise<TxResult>;
}

/** @deprecated Use BalanceResult */
export type ChainBalance = {
  address: string;
  balanceMist: bigint;
  balanceSui: number;
  funded: boolean;
  coinType: string;
};

/** @deprecated Use ExecuteTransactionInput + registry */
export type SuiTransferParams = {
  recipient: string;
  amountMist: bigint;
};

/** @deprecated Use ExecuteTransactionInput + registry */
export type SuiExecuteAction =
  | {
      action: "transfer_sui";
      params: SuiTransferParams;
    }
  | {
      action: "execute_bytes";
      params: { transactionBytes: Uint8Array };
    };

/** @deprecated Use TxResult */
export type SuiTxResult = {
  digest: string;
  sui_address: string;
  effects_status: "success" | "failure" | "unknown";
};
