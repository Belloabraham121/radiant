import type { BalanceResult } from "../types.js";

export type EvmChainBalance = {
  address: string;
  evmChainId: number;
  balanceWei: bigint;
  balanceEth: number;
  funded: boolean;
};

/** Maps EVM RPC balance to chain-agnostic `BalanceResult`. */
export function toEvmBalanceResult(balance: EvmChainBalance): BalanceResult {
  return {
    chain_id: "ethereum",
    address: balance.address,
    balance_atomic: balance.balanceWei.toString(),
    balance_display: balance.balanceEth,
    native_symbol: "ETH",
    funded: balance.funded,
    evm_chain_id: balance.evmChainId,
  };
}
