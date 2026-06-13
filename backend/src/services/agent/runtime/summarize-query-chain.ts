import type { BalanceResult } from "../../chains/types.js";
import type {
  DeepBookManagerBalancesResult,
  DeepBookManagerInfo,
} from "../../defi/deepbook-balance-manager.types.js";
import type {
  DeepBookPoolInfo,
  DeepBookPoolsList,
  DeepBookTickerMap,
} from "../../defi/deepbook-pools.service.js";
import type { DeepBookSwapQuoteResult } from "../../defi/deepbook-swap.service.js";
import type { FlashLoanBundleQuoteResult } from "../../defi/deepbook-flash-loan.types.js";
import type { DeepBookOpenOrdersResult } from "../../defi/deepbook-orders.service.js";
import type { WalletAssetsData } from "../../wallet/wallet-assets.types.js";

export function summarizeQueryChainResult(result: unknown): string | null {
  if (typeof result !== "object" || result === null) {
    return null;
  }

  const openOrders = result as DeepBookOpenOrdersResult;
  if (Array.isArray(openOrders.orders) && openOrders.pool_key && openOrders.manager_object_id) {
    if (openOrders.orders.length === 0) {
      return `No open orders on ${openOrders.pool_key}`;
    }
    const lines = openOrders.orders.slice(0, 8).map((order) => {
      const side = order.is_bid ? "buy" : "sell";
      return `${side} ${order.remaining_quantity} @ ${order.price} (id ${order.order_id.slice(0, 10)}…)`;
    });
    const suffix =
      openOrders.orders.length > 8 ? `\n…and ${openOrders.orders.length - 8} more` : "";
    return `Open orders on ${openOrders.pool_key} (${openOrders.orders.length}):\n${lines.join("\n")}${suffix}`;
  }

  const flashLoanQuote = result as FlashLoanBundleQuoteResult;
  if (
    flashLoanQuote.strategy &&
    typeof flashLoanQuote.repay_feasible === "boolean" &&
    Array.isArray(flashLoanQuote.steps)
  ) {
    const stepSummary = flashLoanQuote.steps
      .map(
        (step, index) =>
          `step ${index + 1} ${step.side} ${step.in_amount}→~${step.out_est} ${step.output_coin}@${step.pool_key}`,
      )
      .join("; ");
    return (
      `Flash loan quote: borrow ${flashLoanQuote.borrow_amount} ${flashLoanQuote.coin_key} ` +
      `from ${flashLoanQuote.pool_key} (${flashLoanQuote.strategy}); ` +
      `${stepSummary || "no swap steps"}; repay_feasible=${flashLoanQuote.repay_feasible}` +
      (flashLoanQuote.estimated_surplus != null
        ? `; surplus~${flashLoanQuote.estimated_surplus}`
        : "")
    );
  }

  const swapQuote = result as DeepBookSwapQuoteResult;
  if (swapQuote.input_coin && swapQuote.output_amount_display != null) {
    return (
      `Swap quote: ${swapQuote.input_amount_display} ${swapQuote.input_coin} → ` +
      `~${swapQuote.output_amount_display} ${swapQuote.output_coin} (${swapQuote.pool_key})`
    );
  }

  const poolsList = result as DeepBookPoolsList;
  if (
    Array.isArray(poolsList.pools) &&
    typeof poolsList.default_pool === "string"
  ) {
    const lines = poolsList.pools.map((pool) => {
      const price = pool.last_price != null ? ` @ ${pool.last_price}` : "";
      return `${pool.pool_key} (${pool.base_coin}/${pool.quote_coin}${price})`;
    });
    return (
      `DeepBook pools (${poolsList.pools.length}), default ${poolsList.default_pool}:\n` +
      lines.join("\n")
    );
  }

  const poolInfo = result as DeepBookPoolInfo;
  if (poolInfo.pool_key && poolInfo.base_coin && poolInfo.quote_coin) {
    const lines = [
      `Pool ${poolInfo.pool_key}: ${poolInfo.base_coin}/${poolInfo.quote_coin}`,
      `Min size ${poolInfo.min_size_display} ${poolInfo.base_coin}, lot ${poolInfo.lot_size_display}`,
    ];
    if (poolInfo.ticker?.last_price != null) {
      lines.push(`Last price: ${poolInfo.ticker.last_price}`);
    }
    if (poolInfo.ticker?.quote_volume_24h != null) {
      lines.push(`24h quote volume: ${poolInfo.ticker.quote_volume_24h}`);
    }
    if (poolInfo.on_chain) {
      lines.push(
        `On-chain fees — taker ${poolInfo.on_chain.taker_fee}, maker ${poolInfo.on_chain.maker_fee}`,
      );
    }
    return lines.join("\n");
  }

  const tickerMap = result as DeepBookTickerMap;
  if (Array.isArray(tickerMap.tickers) && tickerMap.source === "indexer") {
    return tickerMap.tickers
      .map((entry) => `${entry.pool_key}: last ${entry.last_price}`)
      .join("\n");
  }

  const managerInfo = result as DeepBookManagerInfo;
  if (typeof managerInfo.provisioned === "boolean" && managerInfo.manager_key) {
    return managerInfo.provisioned
      ? `DeepBook manager provisioned (${managerInfo.manager_object_id})`
      : "DeepBook manager not provisioned yet";
  }

  const managerBalances = result as DeepBookManagerBalancesResult;
  if (
    Array.isArray(managerBalances.balances) &&
    managerBalances.manager_object_id
  ) {
    const nonZero = managerBalances.balances.filter(
      (b) => b.balance_display > 0,
    );
    if (nonZero.length === 0) {
      return "DeepBook manager balances: all zero";
    }
    return (
      "DeepBook manager balances: " +
      nonZero.map((b) => `${b.balance_display} ${b.coin_key}`).join(", ")
    );
  }

  const balance = result as BalanceResult;
  if (balance.balance_display != null && balance.native_symbol) {
    return `Balance: ${balance.balance_display} ${balance.native_symbol}`;
  }

  const assets = result as WalletAssetsData;
  if (Array.isArray(assets.assets)) {
    const held = assets.assets.filter((a) => a.balance_display > 0);
    if (held.length > 0) {
      return (
        "Wallet tokens: " +
        held.map((a) => `${a.balance_display} ${a.symbol}`).join(", ")
      );
    }
  }

  return null;
}
