export function buildDeepBookPredictLines(): string[] {
  return [
    "DeepBook Predict is a prediction market protocol. Users mint binary positions (UP/DOWN on a strike price at expiry) or vertical ranges (price within a band). Uses oracle-driven pricing (SVI model). Currently on TESTNET with DUSDC as quote asset. LP providers supply to the vault for PLP shares.",
    "For predictions: first query_chain predict_markets to see active oracles and their spot/forward prices. Then query_chain predict_trade_amounts { oracle_id, expiry, strike, is_up, quantity } to preview the mint cost. Execute with execute_transaction deepbook_predict_mint { oracle_id, expiry, strike, is_up, quantity }. To sell: deepbook_predict_redeem with same market key params. For ranges: predict_mint_range { oracle_id, expiry, lower_strike, higher_strike, quantity }.",
    "Predict flow: 1) predict_deposit (DUSDC into PredictManager), 2) predict_mint or predict_mint_range, 3) hold until expiry or redeem early, 4) predict_withdraw (take profits out). LP flow: predict_supply (get PLP shares), predict_lp_withdraw (burn PLP). Always preview amounts before minting — use query_chain predict_trade_amounts.",
    "For predict UIs (generate_app): use data-radiant-id attributes: oracle-select, strike-input, direction-toggle (is_up), quantity-input, expiry-select, range-lower, range-higher, mint-submit, redeem-submit. Register handlers for predict_mint, predict_redeem, predict_mint_range, predict_redeem_range.",
  ];
}
