export type MarginManagerKey = string;
export type MarginPoolKey = string;

export interface MarginManagerState {
  address: string;
  poolKey: string;
  baseBalance: number;
  quoteBalance: number;
  deepBalance: number;
  borrowedBase: number;
  borrowedQuote: number;
  riskRatio: number | null;
}

export interface MarginPoolState {
  poolKey: string;
  totalSupply: number;
  totalBorrow: number;
  supplyShares: number;
  borrowShares: number;
  interestRate: number;
  utilizationRate: number;
  supplyCap: number;
  maxUtilizationRate: number;
  minBorrowAmount: number;
  protocolSpread: number;
  lastUpdateTimestamp: number;
}

export interface MarginPositionSummary {
  managerKey: string;
  poolKey: string;
  baseBalance: number;
  quoteBalance: number;
  borrowedBase: number;
  borrowedQuote: number;
  riskRatio: number | null;
  liquidationThreshold: number;
  borrowThreshold: number;
  withdrawThreshold: number;
}

export interface MarginLimitOrderParams {
  poolKey: string;
  marginManagerKey: string;
  clientOrderId?: string;
  price: number;
  quantity: number;
  isBid: boolean;
  expiration?: number;
  orderType?: "no_restriction" | "immediate_or_cancel" | "fill_or_kill" | "post_only";
  payWithDeep?: boolean;
}

export interface MarginMarketOrderParams {
  poolKey: string;
  marginManagerKey: string;
  clientOrderId?: string;
  quantity: number;
  isBid: boolean;
  payWithDeep?: boolean;
}

export interface MarginDepositParams {
  marginManagerKey: string;
  coinType: "base" | "quote" | "deep";
  amount: number;
}

export interface MarginBorrowParams {
  marginManagerKey: string;
  asset: "base" | "quote";
  amount: number;
}

export interface MarginRepayParams {
  marginManagerKey: string;
  asset: "base" | "quote";
  amount?: number;
}

export interface MarginSupplyPoolParams {
  coinType: string;
  amount: number;
}

export interface MarginWithdrawPoolParams {
  coinType: string;
  amount?: number;
}
