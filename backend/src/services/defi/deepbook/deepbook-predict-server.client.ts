import {
  PREDICT_SERVER_TESTNET,
  type OracleSVIState,
  type PredictManagerState,
  type PredictMarketState,
  type TradeAmounts,
  type VaultSummary,
  type OracleLifecycle,
} from "./deepbook-predict.types.js";

const BASE_URL = PREDICT_SERVER_TESTNET;

async function fetchJSON<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Predict server ${res.status}: ${url}`);
  }
  return res.json() as Promise<T>;
}

export async function getPredictState(predictId: string): Promise<PredictMarketState> {
  const data = await fetchJSON<{
    predict_id: string;
    trading_paused: boolean;
    quote_assets: string[];
    oracles: Array<{
      oracle_id: string;
      spot: number;
      forward: number;
      expiry: number;
      lifecycle: string;
      settlement_price: number | null;
      last_update_timestamp: number;
    }>;
  }>(`/predicts/${predictId}/state`);

  return {
    predictId: data.predict_id ?? predictId,
    tradingPaused: data.trading_paused ?? false,
    quoteAssets: data.quote_assets ?? [],
    oracles: (data.oracles ?? []).map((o) => ({
      oracleId: o.oracle_id,
      spot: o.spot,
      forward: o.forward,
      expiry: o.expiry,
      lifecycle: o.lifecycle as OracleLifecycle,
      settlementPrice: o.settlement_price,
      lastUpdateTimestamp: o.last_update_timestamp,
    })),
  };
}

export async function getOracleState(oracleId: string): Promise<OracleSVIState> {
  const data = await fetchJSON<{
    oracle_id: string;
    spot: number;
    forward: number;
    expiry: number;
    lifecycle: string;
    settlement_price: number | null;
    last_update_timestamp: number;
  }>(`/oracles/${oracleId}/state`);

  return {
    oracleId: data.oracle_id,
    spot: data.spot,
    forward: data.forward,
    expiry: data.expiry,
    lifecycle: data.lifecycle as OracleLifecycle,
    settlementPrice: data.settlement_price,
    lastUpdateTimestamp: data.last_update_timestamp,
  };
}

export async function getPredictOracles(predictId: string): Promise<OracleSVIState[]> {
  const data = await fetchJSON<
    Array<{
      oracle_id: string;
      spot: number;
      forward: number;
      expiry: number;
      lifecycle: string;
      settlement_price: number | null;
      last_update_timestamp: number;
    }>
  >(`/predicts/${predictId}/oracles`);

  return data.map((o) => ({
    oracleId: o.oracle_id,
    spot: o.spot,
    forward: o.forward,
    expiry: o.expiry,
    lifecycle: o.lifecycle as OracleLifecycle,
    settlementPrice: o.settlement_price,
    lastUpdateTimestamp: o.last_update_timestamp,
  }));
}

export async function getVaultSummary(predictId: string): Promise<VaultSummary> {
  const data = await fetchJSON<{
    total_value: number;
    total_plp: number;
    max_payout: number;
    accepted_quote_assets: string[];
    withdrawal_available: number;
  }>(`/predicts/${predictId}/vault/summary`);

  return {
    totalValue: data.total_value,
    totalPLP: data.total_plp,
    maxPayout: data.max_payout,
    acceptedQuoteAssets: data.accepted_quote_assets ?? [],
    withdrawalAvailable: data.withdrawal_available,
  };
}

export async function getManagerSummary(managerId: string): Promise<PredictManagerState> {
  const data = await fetchJSON<{
    address: string;
    owner: string;
    balances: Record<string, number>;
    positions: Array<{
      market_key: { oracle_id: string; expiry: number; strike: number; is_up: boolean };
      quantity: number;
    }>;
    ranges: Array<{
      range_key: { oracle_id: string; expiry: number; lower_strike: number; higher_strike: number };
      quantity: number;
    }>;
  }>(`/managers/${managerId}/summary`);

  return {
    address: data.address,
    owner: data.owner,
    balances: data.balances ?? {},
    positions: (data.positions ?? []).map((p) => ({
      marketKey: {
        oracleId: p.market_key.oracle_id,
        expiry: p.market_key.expiry,
        strike: p.market_key.strike,
        isUp: p.market_key.is_up,
      },
      quantity: p.quantity,
    })),
    ranges: (data.ranges ?? []).map((r) => ({
      rangeKey: {
        oracleId: r.range_key.oracle_id,
        expiry: r.range_key.expiry,
        lowerStrike: r.range_key.lower_strike,
        higherStrike: r.range_key.higher_strike,
      },
      quantity: r.quantity,
    })),
  };
}

export async function getTradeAmounts(
  oracleId: string,
  expiry: number,
  strike: number,
  isUp: boolean,
  quantity: number,
): Promise<TradeAmounts> {
  const data = await fetchJSON<{ mint_cost: number; redeem_payout: number }>(
    `/oracles/${oracleId}/trade-amounts?expiry=${expiry}&strike=${strike}&is_up=${isUp}&quantity=${quantity}`,
  );
  return { mintCost: data.mint_cost, redeemPayout: data.redeem_payout };
}

export async function getRangeTradeAmounts(
  oracleId: string,
  expiry: number,
  lowerStrike: number,
  higherStrike: number,
  quantity: number,
): Promise<TradeAmounts> {
  const data = await fetchJSON<{ mint_cost: number; redeem_payout: number }>(
    `/oracles/${oracleId}/range-trade-amounts?expiry=${expiry}&lower_strike=${lowerStrike}&higher_strike=${higherStrike}&quantity=${quantity}`,
  );
  return { mintCost: data.mint_cost, redeemPayout: data.redeem_payout };
}

export async function getQuoteAssets(predictId: string): Promise<string[]> {
  const data = await fetchJSON<string[]>(`/predicts/${predictId}/quote-assets`);
  return data ?? [];
}
