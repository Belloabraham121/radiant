import type { BalanceResult } from "../types.js";

export type StellarChainBalance = {
  address: string;
  balanceStroops: bigint;
  balanceXlm: number;
  funded: boolean;
};

/** Maps Horizon native balance to chain-agnostic `BalanceResult`. */
export function toStellarBalanceResult(balance: StellarChainBalance): BalanceResult {
  return {
    chain_id: "stellar",
    address: balance.address,
    balance_atomic: balance.balanceStroops.toString(),
    balance_display: balance.balanceXlm,
    native_symbol: "XLM",
    funded: balance.funded,
  };
}
