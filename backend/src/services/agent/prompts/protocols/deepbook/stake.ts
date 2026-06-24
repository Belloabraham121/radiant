export function buildDeepBookStakeLines(): string[] {
  return [
    "For DEEP staking on DeepBook pools: staking uses DEEP in the balance manager (not the main wallet). Research: query_chain deepbook_stake_balance { pool_key } for active/inactive stake; deepbook_stake_required { pool_key } for current fee tier and minimum stake. Execution: deepbook_stake { pool_key, amount_display } or deepbook_unstake { pool_key }. If the user wants to stake but manager DEEP is low, query deepbook_manager_balance for DEEP and suggest deepbook_deposit first. Unstake returns DEEP to the manager — no amount param. Never ask in chat to confirm stake/unstake — call execute_transaction and let the approval dialog handle it.",
  ];
}
