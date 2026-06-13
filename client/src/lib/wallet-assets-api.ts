import { apiFetch } from "./api";
import type { AgentChainId } from "./agent-chains";

export type WalletAssetRow = {
  symbol: string;
  name: string;
  coin_type: string;
  balance_atomic: string;
  balance_display: number;
  decimals: number;
  usd_value: number | null;
  source: "sui_rpc" | "privy";
  popular: boolean;
};

export type WalletAssetsData = {
  chain_id: AgentChainId;
  address: string;
  evm_chain_id?: number;
  total_usd: number | null;
  assets: WalletAssetRow[];
  catalog_source: "indexer" | "fallback" | "privy";
  updated_at: string;
};

export type FetchWalletAssetsOptions = {
  evmChainId?: number;
  includeZero?: boolean;
  includeUsd?: boolean;
};

export async function fetchWalletAssets(
  chainId?: AgentChainId,
  options?: FetchWalletAssetsOptions,
): Promise<WalletAssetsData> {
  const params = new URLSearchParams();
  if (chainId) {
    params.set("chain", chainId);
  }
  if (options?.evmChainId !== undefined) {
    params.set("evm_chain_id", String(options.evmChainId));
  }
  if (options?.includeZero === false) {
    params.set("include_zero", "false");
  }
  if (options?.includeUsd === false) {
    params.set("include_usd", "false");
  }

  const query = params.toString();
  return apiFetch<WalletAssetsData>(
    `/api/v1/wallets/assets${query.length > 0 ? `?${query}` : ""}`,
  );
}
