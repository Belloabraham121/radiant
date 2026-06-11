import { z } from "zod";
import { chainIdSchema, type ChainId } from "../chains/types.js";

export const suiAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid Sui address");

export const evmAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address");

/** Base58 Solana pubkey — permissive length for embedded wallet addresses. */
export const solanaAddressSchema = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid Solana address");

const registerWalletBodyBaseSchema = z.object({
  chain_type: chainIdSchema.default("sui"),
  privy_wallet_id: z.string().min(1),
  address: z.string().min(1).optional(),
  sui_address: suiAddressSchema.optional(),
  signer_added: z.boolean().optional().default(false),
});

export const registerWalletBodySchema = registerWalletBodyBaseSchema.superRefine(
  (body, ctx) => {
    const address = body.address ?? body.sui_address;
    if (!address) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "address or sui_address is required",
        path: ["address"],
      });
      return;
    }
    if (body.chain_type === "sui" && !suiAddressSchema.safeParse(address).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid Sui address",
        path: ["address"],
      });
    }
    if (body.chain_type === "ethereum" && !evmAddressSchema.safeParse(address).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid EVM address",
        path: ["address"],
      });
    }
    if (body.chain_type === "solana" && !solanaAddressSchema.safeParse(address).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid Solana address",
        path: ["address"],
      });
    }
  },
).transform((body) => ({
  chain_type: body.chain_type,
  privy_wallet_id: body.privy_wallet_id,
  address: (body.address ?? body.sui_address)!,
  signer_added: body.signer_added ?? false,
}));

export type RegisterWalletInput = z.infer<typeof registerWalletBodySchema>;

export type AgentWalletSummary = {
  chain_type: ChainId;
  address: string;
  privy_wallet_id: string;
  signer_added: boolean;
  funded: boolean;
  /** Legacy alias when chain_type is sui. */
  sui_address?: string;
};

export type WalletBalanceData = {
  chain_id: ChainId;
  address: string;
  balance_atomic: string;
  balance_display: number;
  native_symbol: string;
  coin_type?: string;
  funded: boolean;
  sui_address: string;
  balance_mist: string;
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
