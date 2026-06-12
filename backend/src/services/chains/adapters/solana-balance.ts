import type { BalanceResult } from "../types.js";

export type SolanaChainBalance = {
  address: string;
  balanceLamports: bigint;
  balanceSol: number;
  funded: boolean;
};

/** Maps Solana RPC balance to chain-agnostic `BalanceResult`. */
export function toSolanaBalanceResult(balance: SolanaChainBalance): BalanceResult {
  return {
    chain_id: "solana",
    address: balance.address,
    balance_atomic: balance.balanceLamports.toString(),
    balance_display: balance.balanceSol,
    native_symbol: "SOL",
    funded: balance.funded,
  };
}
