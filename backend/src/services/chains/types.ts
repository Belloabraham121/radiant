export type ChainBalance = {
  address: string;
  balanceMist: bigint;
  balanceSui: number;
  funded: boolean;
  coinType: string;
};

export type SuiTransferParams = {
  recipient: string;
  amountMist: bigint;
};

export type SuiExecuteAction =
  | {
      action: "transfer_sui";
      params: SuiTransferParams;
    }
  | {
      action: "execute_bytes";
      params: { transactionBytes: Uint8Array };
    };

export type SuiTxResult = {
  digest: string;
  sui_address: string;
  effects_status: "success" | "failure" | "unknown";
};
