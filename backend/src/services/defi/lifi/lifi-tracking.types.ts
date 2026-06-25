import type { ChainId } from "../../chains/types.js";

export type LifiPendingStepMeta = {
  step_index: number;
  chain_id: number;
  action: string;
  message: string;
};

/** Persisted on agent_transaction.result.lifi and used by the status poller. */
export type LifiTrackingMeta = {
  route_id: string;
  tx_hashes: string[];
  from_chain_id: ChainId;
  to_chain_id: ChainId;
  from_evm_chain_id?: number;
  to_evm_chain_id?: number;
  bridge_tool: string | null;
  estimated_duration_seconds: number | null;
  /** ISO timestamp when source tx confirmed — anchors client countdown. */
  bridge_started_at: string | null;
  tracking_status: string | null;
  substatus: string | null;
  substatus_message: string | null;
  receiving_tx_hash: string | null;
  /** Set when executeRoute paused for a destination-chain signature. */
  pending_step?: LifiPendingStepMeta | null;
};

export type LifiTrackJobInput = {
  transactionId: string;
  privyUserId: string;
  sessionId: string | null;
  tracking: LifiTrackingMeta;
};
