import type { ChainId } from "../../chains/types.js";
import type { SquidChainflipBridgeType, SquidChainflipDepositInfo } from "./squid.types.js";

/** Persisted on agent_transaction.result.squid and used by the status poller. */
export type SquidTrackingMeta = {
  route_id: string;
  quote_id: string;
  request_id: string | null;
  transaction_id: string | null;
  tx_hashes: string[];
  from_chain_id: ChainId;
  to_chain_id: ChainId;
  from_evm_chain_id?: number;
  to_evm_chain_id?: number;
  estimated_duration_seconds: number | null;
  bridge_started_at: string | null;
  tracking_status: string | null;
  substatus: string | null;
  substatus_message: string | null;
  receiving_tx_hash: string | null;
  bridge_type?: SquidChainflipBridgeType | null;
  chainflip_status_tracking_id?: string | null;
  chainflip_deposit?: SquidChainflipDepositInfo | null;
};

export type SquidTrackJobInput = {
  transactionId: string;
  privyUserId: string;
  sessionId: string | null;
  tracking: SquidTrackingMeta;
};
