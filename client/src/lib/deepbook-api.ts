import { apiFetch } from "./api";

export type DeepBookManagerInfo = {
  chain_id: "sui";
  manager_key: string;
  manager_object_id: string | null;
  trade_cap_id: string | null;
  provisioned: boolean;
};

export type DeepBookManagerBalance = {
  coin_key: string;
  coin_type: string;
  balance_display: number;
};

export type DeepBookManagerBalances = {
  chain_id: "sui";
  manager_key: string;
  manager_object_id: string;
  balances: DeepBookManagerBalance[];
};

export type DeepBookManagerUiData = {
  manager: DeepBookManagerInfo;
  balances: DeepBookManagerBalances | null;
  updated_at: string;
};

export type DeepBookPoolSummary = {
  pool_key: string;
  base_coin: string;
  quote_coin: string;
  last_price: number | null;
  volume_24h: number | null;
};

export type DeepBookPoolsData = {
  pools: DeepBookPoolSummary[];
  default_pool: string;
  source: "indexer";
};

export type DeepBookOrderbook = {
  pool_key: string;
  bids: [number, number][];
  asks: [number, number][];
};

export async function fetchDeepBookManager(): Promise<DeepBookManagerUiData> {
  return apiFetch<DeepBookManagerUiData>("/api/v1/defi/balance-manager");
}

export async function fetchDeepBookPools(): Promise<DeepBookPoolsData> {
  return apiFetch<DeepBookPoolsData>("/api/v1/defi/pools");
}

export async function fetchDeepBookOrderbook(
  poolName: string,
  options?: { level?: 1 | 2; depth?: number },
): Promise<DeepBookOrderbook> {
  const params = new URLSearchParams();
  if (options?.level !== undefined) params.set("level", String(options.level));
  if (options?.depth !== undefined) params.set("depth", String(options.depth));
  const query = params.toString();
  return apiFetch<DeepBookOrderbook>(
    `/api/v1/defi/pools/${encodeURIComponent(poolName)}/orderbook${query ? `?${query}` : ""}`,
  );
}
