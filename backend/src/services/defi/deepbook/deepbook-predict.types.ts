export interface MarketKey {
  oracleId: string;
  expiry: number;
  strike: number;
  isUp: boolean;
}

export interface RangeKey {
  oracleId: string;
  expiry: number;
  lowerStrike: number;
  higherStrike: number;
}

export type OracleLifecycle = "inactive" | "active" | "pending_settlement" | "settled";

export interface OracleSVIState {
  oracleId: string;
  spot: number;
  forward: number;
  expiry: number;
  lifecycle: OracleLifecycle;
  settlementPrice: number | null;
  lastUpdateTimestamp: number;
}

export interface PredictManagerState {
  address: string;
  owner: string;
  balances: Record<string, number>;
  positions: PredictPosition[];
  ranges: PredictRangePosition[];
}

export interface PredictPosition {
  marketKey: MarketKey;
  quantity: number;
}

export interface PredictRangePosition {
  rangeKey: RangeKey;
  quantity: number;
}

export interface TradeAmounts {
  mintCost: number;
  redeemPayout: number;
}

export interface VaultSummary {
  totalValue: number;
  totalPLP: number;
  maxPayout: number;
  acceptedQuoteAssets: string[];
  withdrawalAvailable: number;
}

export interface PredictMarketState {
  predictId: string;
  oracles: OracleSVIState[];
  quoteAssets: string[];
  tradingPaused: boolean;
}

export interface PredictMintParams {
  oracleId: string;
  expiry: number;
  strike: number;
  isUp: boolean;
  quantity: number;
  quoteAsset?: string;
}

export interface PredictRedeemParams {
  oracleId: string;
  expiry: number;
  strike: number;
  isUp: boolean;
  quantity: number;
}

export interface PredictMintRangeParams {
  oracleId: string;
  expiry: number;
  lowerStrike: number;
  higherStrike: number;
  quantity: number;
  quoteAsset?: string;
}

export interface PredictRedeemRangeParams {
  oracleId: string;
  expiry: number;
  lowerStrike: number;
  higherStrike: number;
  quantity: number;
}

export interface PredictSupplyParams {
  quoteAsset: string;
  amount: number;
}

export interface PredictLPWithdrawParams {
  quoteAsset: string;
  plpAmount: number;
}

export interface PredictDepositParams {
  quoteAsset: string;
  amount: number;
}

export interface PredictWithdrawParams {
  quoteAsset: string;
  amount: number;
}

/** Predict server endpoints base URL (testnet). */
export const PREDICT_SERVER_TESTNET = "https://predict-server.testnet.mystenlabs.com";

/** Current testnet deployment constants. */
export const PREDICT_TESTNET_CONFIG = {
  predictPackage: "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138",
  predictRegistry: "0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64",
  predictObject: "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a",
  quoteAsset: "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC",
  plpCoinType: "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138::plp::PLP",
} as const;
