import { z } from "zod";

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
  sui_address: string;
  balance_mist: string;
  balance_sui: number;
  coin_type: string;
  funded: boolean;
};
