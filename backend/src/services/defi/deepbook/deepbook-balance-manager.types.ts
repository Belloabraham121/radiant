export type DeepBookManagerInfo = {
  chain_id: "sui";
  manager_key: string;
  manager_object_id: string | null;
  trade_cap_id: string | null;
  provisioned: boolean;
};

export type ProvisionedDeepBookManager = DeepBookManagerInfo & {
  manager_object_id: string;
  provisioned: true;
  /** Set when the manager was just created on chain in this session. */
  provision_digest?: string;
};

export type DeepBookManagerBalance = {
  coin_key: string;
  coin_type: string;
  balance_display: number;
};

export type DeepBookManagerBalancesResult = {
  chain_id: "sui";
  manager_key: string;
  manager_object_id: string;
  balances: DeepBookManagerBalance[];
};

export type DeepBookDepositWithdrawParams = {
  coin_key: string;
  amount_display: number;
  withdraw_all?: boolean;
  recipient?: string;
};
