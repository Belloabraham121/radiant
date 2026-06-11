import { z } from "zod";
import { chainIdSchema, type ChainId } from "../chains/types.js";

export const suiAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid Sui address");

export const registerWalletBodySchema = z.object({
  privy_wallet_id: z.string().min(1),
  sui_address: suiAddressSchema,
  signer_added: z.boolean().optional().default(false),
});

export type RegisterWalletInput = z.infer<typeof registerWalletBodySchema>;

export type WalletBalanceData = {
  chain_id: ChainId;
  address: string;
  balance_atomic: string;
  balance_display: number;
  native_symbol: string;
  coin_type?: string;
  funded: boolean;
  /** Sui-era alias — same as `address` while schema is Sui-only (Phase 7.3 generalizes). */
  sui_address: string;
  /** Sui-era alias — same as `balance_atomic`. */
  balance_mist: string;
  /** Sui-era alias — same as `balance_display`. */
  balance_sui: number;
};

export const walletBalancesQuerySchema = z.object({
  chain: chainIdSchema.optional(),
});

export const signAndSendBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("transfer_sui"),
    recipient: suiAddressSchema,
    amount_mist: z
      .string()
      .regex(/^[1-9]\d*$/, "amount_mist must be a positive integer string"),
  }),
  z.object({
    action: z.literal("execute_bytes"),
    transaction_bytes: z.string().min(1, "transaction_bytes is required"),
  }),
]);

export type SignAndSendBody = z.infer<typeof signAndSendBodySchema>;

export type SignAndSendResult = {
  digest: string;
  sui_address: string;
  effects_status: "success" | "failure" | "unknown";
};
