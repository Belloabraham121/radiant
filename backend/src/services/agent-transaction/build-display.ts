import { getDeepBookEnv } from "../../config/deepbook.js";
import {
  isDeepBookSwapAction,
  parseDeepBookSwapParams,
} from "../defi/deepbook-swap.service.js";
import {
  parseDeepBookCancelAllOrdersParams,
  parseDeepBookCancelOrderParams,
  parseDeepBookCancelOrdersParams,
  parseDeepBookLimitOrderParams,
  parseDeepBookMarketOrderParams,
  parseDeepBookModifyOrderParams,
  parseDeepBookWithdrawSettledParams,
} from "../defi/deepbook-orders.service.js";
import {
  checkManagerBalance,
  parseDeepBookDepositWithdrawParams,
} from "../defi/deepbook-balance-manager.service.js";
import { isDeepBookProvisionAction } from "../agent/validate-execute-transaction.js";
import {
  isDeepBookFlashLoanAction,
  parseDeepBookFlashLoanParams,
} from "../defi/deepbook-flash-loan.service.js";
import {
  isDeepBookStakeAction,
  parseDeepBookStakeParams,
  parseDeepBookUnstakeParams,
} from "../defi/deepbook-stake.service.js";
import {
  isDeepBookGovernanceAction,
  parseDeepBookSubmitProposalParams,
  parseDeepBookVoteParams,
} from "../defi/deepbook-governance.service.js";
import type { ExecuteTransactionInput, ChainId, TxResult } from "../chains/types.js";
import { fmtDisplayNumber } from "../../utils/format-display-number.js";

const DEEPBOOK_WRITE_ACTIONS = new Set(["deepbook_deposit", "deepbook_withdraw"]);

export type TransactionDisplay = {
  title: string;
  amount_display: string;
};

function parseAmountAtomic(params: Record<string, unknown>): bigint | null {
  const raw = params.amount_atomic ?? params.amount_mist ?? params.amount_wei ?? params.amount_lamports;
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) {
    return null;
  }
  return BigInt(raw);
}

function formatAmountDisplay(chainId: ChainId, amountAtomic: bigint): string {
  switch (chainId) {
    case "sui": {
      const sui = Number(amountAtomic) / 1_000_000_000;
      return `${fmtDisplayNumber(sui, 4)} SUI`;
    }
    case "ethereum": {
      const eth = Number(amountAtomic) / 1e18;
      return `${fmtDisplayNumber(eth, 6)} ETH`;
    }
    case "solana": {
      const sol = Number(amountAtomic) / 1_000_000_000;
      return `${fmtDisplayNumber(sol, 4)} SOL`;
    }
    default:
      return amountAtomic.toString();
  }
}

/** Human-readable title and amount line for approval UI and transaction history. */
export async function buildTransactionDisplay(
  privyUserId: string | null,
  input: ExecuteTransactionInput,
): Promise<TransactionDisplay> {
  const amount = parseAmountAtomic(input.params) ?? BigInt(0);
  const recipient =
    typeof input.params.recipient === "string" ? input.params.recipient : "unknown recipient";

  let title = `Send ${formatAmountDisplay(input.chain_id, amount)} to ${recipient.slice(0, 12)}… on ${input.chain_id}`;
  let amount_display = formatAmountDisplay(input.chain_id, amount);

  if (isDeepBookProvisionAction(input.action)) {
    title = "Create DeepBook balance manager";
    amount_display = "Network fee only (~0.01 SUI)";
  } else if (DEEPBOOK_WRITE_ACTIONS.has(input.action)) {
    const parsed = parseDeepBookDepositWithdrawParams(input.params);
    if (parsed.withdraw_all && input.action === "deepbook_withdraw" && privyUserId) {
      try {
        const balance = await checkManagerBalance(privyUserId, parsed.coin_key);
        amount_display =
          balance.balance_display > 0
            ? `all ${parsed.coin_key} (${fmtDisplayNumber(balance.balance_display)} ${parsed.coin_key})`
            : `all ${parsed.coin_key}`;
      } catch {
        amount_display = `all ${parsed.coin_key}`;
      }
    } else if (parsed.withdraw_all && input.action === "deepbook_withdraw") {
      amount_display = `all ${parsed.coin_key}`;
    } else {
      amount_display = `${fmtDisplayNumber(parsed.amount_display)} ${parsed.coin_key}`;
    }
    const verb = input.action === "deepbook_deposit" ? "Deposit" : "Withdraw";
    title = `${verb} ${amount_display} via DeepBook balance manager`;
  } else if (isDeepBookSwapAction(input.action)) {
    try {
      const parsed = parseDeepBookSwapParams(input.params);
      const poolDef =
        getDeepBookEnv().pools[parsed.pool_key as keyof ReturnType<typeof getDeepBookEnv>["pools"]];
      const inputCoin =
        parsed.side === "sell"
          ? (poolDef?.baseCoin ?? "base")
          : (poolDef?.quoteCoin ?? "quote");
      const outputCoin =
        parsed.side === "sell"
          ? (poolDef?.quoteCoin ?? "quote")
          : (poolDef?.baseCoin ?? "base");
      const estOut =
        typeof input.params.estimated_out_display === "number"
          ? input.params.estimated_out_display
          : null;
      amount_display = `${fmtDisplayNumber(parsed.amount)} ${inputCoin} → ${estOut !== null ? `~${fmtDisplayNumber(estOut)} ` : ""}${outputCoin}`;
      title = `Swap on DeepBook (${parsed.pool_key})`;
    } catch {
      amount_display = "DeepBook swap";
      title = "Swap via DeepBook";
    }
  } else if (input.action === "deepbook_place_limit_order") {
    try {
      const parsed = parseDeepBookLimitOrderParams(input.params);
      const side = parsed.is_bid ? "buy" : "sell";
      amount_display = `${side} ${fmtDisplayNumber(parsed.quantity)} @ ${fmtDisplayNumber(parsed.price)} (${parsed.pool_key})`;
      title = `Place limit order on DeepBook (${parsed.pool_key})`;
    } catch {
      amount_display = "DeepBook limit order";
      title = "Place limit order via DeepBook";
    }
  } else if (input.action === "deepbook_place_market_order") {
    try {
      const parsed = parseDeepBookMarketOrderParams(input.params);
      const side = parsed.is_bid ? "buy" : "sell";
      amount_display = `${side} ${fmtDisplayNumber(parsed.quantity)} market (${parsed.pool_key})`;
      title = `Place market order on DeepBook (${parsed.pool_key})`;
    } catch {
      amount_display = "DeepBook market order";
      title = "Place market order via DeepBook";
    }
  } else if (input.action === "deepbook_cancel_order") {
    try {
      const parsed = parseDeepBookCancelOrderParams(input.params);
      amount_display = `Cancel order ${parsed.order_id.slice(0, 12)}…`;
      title = `Cancel DeepBook order (${parsed.pool_key})`;
    } catch {
      amount_display = "Cancel order";
      title = "Cancel DeepBook order";
    }
  } else if (input.action === "deepbook_cancel_all_orders") {
    try {
      const parsed = parseDeepBookCancelAllOrdersParams(input.params);
      amount_display = `Cancel all open orders (${parsed.pool_key})`;
      title = "Cancel all DeepBook orders";
    } catch {
      amount_display = "Cancel all orders";
      title = "Cancel all DeepBook orders";
    }
  } else if (input.action === "deepbook_cancel_orders") {
    try {
      const parsed = parseDeepBookCancelOrdersParams(input.params);
      amount_display = `Cancel ${fmtDisplayNumber(parsed.order_ids.length, 0)} orders (${parsed.pool_key})`;
      title = `Cancel ${fmtDisplayNumber(parsed.order_ids.length, 0)} DeepBook orders`;
    } catch {
      amount_display = "Cancel multiple orders";
      title = "Cancel DeepBook orders";
    }
  } else if (input.action === "deepbook_modify_order") {
    try {
      const parsed = parseDeepBookModifyOrderParams(input.params);
      amount_display = `Modify order ${parsed.order_id.slice(0, 12)}… → qty ${fmtDisplayNumber(parsed.quantity)}`;
      title = `Modify DeepBook order (${parsed.pool_key})`;
    } catch {
      amount_display = "Modify order";
      title = "Modify DeepBook order";
    }
  } else if (input.action === "deepbook_withdraw_settled_amounts") {
    try {
      const parsed = parseDeepBookWithdrawSettledParams(input.params);
      amount_display = `Claim settled proceeds (${parsed.pool_key})`;
      title = "Withdraw settled amounts from DeepBook";
    } catch {
      amount_display = "Claim settled proceeds";
      title = "Withdraw settled amounts";
    }
  } else if (input.action === "deepbook_withdraw_settled_amounts_permissionless") {
    try {
      const parsed = parseDeepBookWithdrawSettledParams(input.params);
      amount_display = `Claim settled proceeds — permissionless (${parsed.pool_key})`;
      title = "Withdraw settled amounts (permissionless)";
    } catch {
      amount_display = "Claim settled proceeds";
      title = "Withdraw settled amounts (permissionless)";
    }
  } else if (isDeepBookFlashLoanAction(input.action)) {
    try {
      const parsed = parseDeepBookFlashLoanParams(input.params);
      if (parsed.strategy === "swap_chain_repay" && parsed.steps?.length) {
        const route = parsed.steps
          .map((step) => `${step.side} ${fmtDisplayNumber(step.amount)} @ ${step.pool_key}`)
          .join(" → ");
        amount_display = `Borrow ${fmtDisplayNumber(parsed.borrow_amount)} ${parsed.coin_key} → ${route} → repay ${fmtDisplayNumber(parsed.borrow_amount)} ${parsed.coin_key}`;
        title = `Flash loan bundle (${parsed.pool_key})`;
      } else {
        amount_display = `Borrow ${fmtDisplayNumber(parsed.borrow_amount)} ${parsed.coin_key} (${parsed.pool_key})`;
        title = `DeepBook flash loan (${parsed.pool_key})`;
      }
    } catch {
      amount_display = "DeepBook flash loan";
      title = "DeepBook flash loan";
    }
  } else if (input.action === "deepbook_stake") {
    try {
      const parsed = parseDeepBookStakeParams(input.params);
      amount_display = `${fmtDisplayNumber(parsed.amount_display)} DEEP`;
      title = `Stake DEEP on DeepBook (${parsed.pool_key})`;
    } catch {
      amount_display = "Stake DEEP";
      title = "Stake DEEP on DeepBook";
    }
  } else if (input.action === "deepbook_unstake") {
    try {
      const parsed = parseDeepBookUnstakeParams(input.params);
      amount_display = "All active stake → balance manager";
      title = `Unstake DEEP from DeepBook (${parsed.pool_key})`;
    } catch {
      amount_display = "Unstake DEEP";
      title = "Unstake DEEP from DeepBook";
    }
  } else if (input.action === "deepbook_submit_proposal") {
    try {
      const parsed = parseDeepBookSubmitProposalParams(input.params);
      amount_display = `taker ${fmtDisplayNumber(parsed.taker_fee)} · maker ${fmtDisplayNumber(parsed.maker_fee)} · stake ${fmtDisplayNumber(parsed.stake_required)} DEEP`;
      title = `Submit governance proposal (${parsed.pool_key})`;
    } catch {
      amount_display = "Governance proposal";
      title = "Submit DeepBook governance proposal";
    }
  } else if (input.action === "deepbook_vote") {
    try {
      const parsed = parseDeepBookVoteParams(input.params);
      amount_display = `Vote for ${parsed.proposal_id.slice(0, 12)}…`;
      title = `Vote on DeepBook proposal (${parsed.pool_key})`;
    } catch {
      amount_display = "Governance vote";
      title = "Vote on DeepBook proposal";
    }
  }

  return { title, amount_display };
}

/** Refine amount_display after on-chain execution when actual fills are known. */
export function enrichDisplayFromResult(amountDisplay: string, result: TxResult): string {
  const swap = result.deepbook?.swap;
  if (swap) {
    return `${fmtDisplayNumber(swap.in_amount_display)} ${swap.input_coin} → ${fmtDisplayNumber(swap.out_amount_display)} ${swap.output_coin}`;
  }

  const order = result.deepbook?.order;
  if (order?.action?.includes("place") && order.quantity != null) {
    const side = order.is_bid ? "buy" : "sell";
    return order.price != null
      ? `${side} ${fmtDisplayNumber(order.quantity)} @ ${fmtDisplayNumber(order.price)}`
      : `${side} ${fmtDisplayNumber(order.quantity)} market`;
  }

  if (order?.action?.includes("cancel")) {
    const count = order.cancelled_count ?? 1;
    return `${fmtDisplayNumber(count, 0)} order(s) cancelled`;
  }

  if (order?.action?.includes("modify") && order.quantity != null) {
    return `qty ${fmtDisplayNumber(order.quantity)}`;
  }

  const flashLoan = result.deepbook?.flash_loan;
  if (flashLoan) {
    const surplus =
      typeof flashLoan.estimated_surplus === "number" && flashLoan.estimated_surplus > 0
        ? ` (surplus ~${fmtDisplayNumber(flashLoan.estimated_surplus)} ${flashLoan.coin_key})`
        : "";
    if (flashLoan.steps_count && flashLoan.steps_count > 0) {
      return `Flash loan bundle: borrow ${fmtDisplayNumber(flashLoan.borrow_amount)} ${flashLoan.coin_key}${surplus}`;
    }
    return `Borrow ${fmtDisplayNumber(flashLoan.borrow_amount)} ${flashLoan.coin_key}${surplus}`;
  }

  const coinKey = result.deepbook?.coin_key;
  const amount = result.deepbook?.amount_display;
  if (coinKey && amount != null) {
    return `${fmtDisplayNumber(amount)} ${coinKey}`;
  }

  return amountDisplay;
}
