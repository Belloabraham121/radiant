export function buildDeepBookGovernanceLines(): string[] {
  return [
    "DeepBook governance requires Allow governance actions in Settings. Research: query_chain deepbook_governance_state { pool_key } for quorum, current/next-epoch fees and stake_required, and your account stake plus voted_proposal id. Execution: deepbook_submit_proposal { pool_key, taker_fee, maker_fee, stake_required } — fee values are decimal rates like pool trade params (e.g. 0.0001), stake_required is DEEP; deepbook_vote { pool_key, proposal_id } — proposal_id is a Sui object ID (0x…). You need active stake to propose or vote. Never ask in chat to confirm governance txs — call execute_transaction and let the approval dialog handle it.",
  ];
}
