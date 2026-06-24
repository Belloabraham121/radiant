import { getDeepBookEnv } from "../../../../../config/deepbook.js";
import { defaultSuiStablePoolKey } from "../../../../defi/deepbook/pool-key.js";

export function buildDeepBookEnvLines(): string[] {
  const deepBook = getDeepBookEnv();
  const suiStablePool = defaultSuiStablePoolKey();
  const knownPools = Object.keys(deepBook.pools).slice(0, 8).join(", ");
  return [
    `DeepBook runs on ${deepBook.env}. Default pool: ${deepBook.defaultPool}. For SUI↔USDC wallet swaps use pool_key ${suiStablePool} — do not invent SUI_USDC on testnet (use SUI_DBUSDC). Known pools include ${knownPools}. Pool keys use underscores — not slashes.`,
    "For pool or market questions, call query_chain deepbook_pool_info, deepbook_pools, or deepbook_ticker. For volume/trades/candles use deepbook_volume, deepbook_trades, deepbook_ohlcv. Do not say a pool is unavailable unless the tool returned POOL_NOT_FOUND.",
  ];
}
