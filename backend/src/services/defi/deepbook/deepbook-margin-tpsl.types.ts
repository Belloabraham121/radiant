export type TpslOrderKind = "limit" | "market";
export type TpslType = "take_profit" | "stop_loss";

export type MarginTpslPendingOrderParams =
  | {
      kind: "limit";
      clientOrderId: string;
      price: number;
      quantity: number;
      isBid: boolean;
      payWithDeep: boolean;
    }
  | {
      kind: "market";
      clientOrderId: string;
      quantity: number;
      isBid: boolean;
      payWithDeep: boolean;
    };

export type ParsedMarginTpslAddParams = {
  managerKey: string;
  conditionalOrderId: string;
  triggerBelowPrice: boolean;
  triggerPrice: number;
  pendingOrder: MarginTpslPendingOrderParams;
  tpslType: TpslType;
};
