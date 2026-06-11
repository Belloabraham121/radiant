import type { BalanceResult, ChainBalance } from "../types.js";

/** Maps internal Sui RPC balance to chain-agnostic `BalanceResult`. */
export function toSuiBalanceResult(balance: ChainBalance): BalanceResult {
  return {
    chain_id: "sui",
    address: balance.address,
    balance_atomic: balance.balanceMist.toString(),
    balance_display: balance.balanceSui,
    native_symbol: "SUI",
    coin_type: balance.coinType,
    funded: balance.funded,
  };
}
