import { getDefaultAgentChainId } from "../../config/chains.js";
import { getAdapter } from "../chains/registry.js";
import type { BalanceResult, ChainId } from "../chains/types.js";
import type { WalletBalanceData } from "./wallet.types.js";

export { mistToSui } from "../../utils/sui-amount.js";

/** Fetch native balance for an address via the chain registry (no chain SDKs here). */
export async function getBalanceForAddress(
  chainId: ChainId,
  address: string,
): Promise<BalanceResult> {
  const adapter = getAdapter(chainId);
  return adapter.getBalance(address);
}

export async function getBalanceForAddressOnDefaultChain(
  address: string,
): Promise<BalanceResult> {
  return getBalanceForAddress(getDefaultAgentChainId(), address);
}

export function balanceResultToWalletData(result: BalanceResult): WalletBalanceData {
  return {
    chain_id: result.chain_id,
    address: result.address,
    balance_atomic: result.balance_atomic,
    balance_display: result.balance_display,
    native_symbol: result.native_symbol,
    coin_type: result.coin_type,
    funded: result.funded,
    sui_address: result.address,
    balance_mist: result.balance_atomic,
    balance_sui: result.balance_display,
  };
}
