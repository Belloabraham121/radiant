/**
 * Classifies a single workflow step segment into a concrete tool input.
 * Does not decide whether a full user message is multi-step — that is the LLM planner's job.
 */
import { getDeepBookEnv } from "../../../config/deepbook.js";
import {
  inferSwapSideForPool,
  normalizePoolKey,
  resolveSwapPoolKey,
} from "../../defi/deepbook/pool-key.js";
import { extractDepositIntent } from "../deepbook/deposit-approval-flow.js";
import { userAskedMarketPrice } from "../deepbook/compound-request-flow.js";
import { extractWithdrawIntent } from "../deepbook/withdraw-approval-flow.js";
import type {
  WorkflowAgentStep,
  WorkflowBuildStep,
  WorkflowExecuteStep,
  WorkflowQueryStep,
  WorkflowStep,
} from "./workflow.types.js";

const COIN = "SUI|USDC|DBUSDC|DEEP|WAL|USDT|DBUSDT";
const COIN_SUFFIX = "(?:\\s+tokens?)?";
const SUI_ADDRESS = /0x[a-fA-F0-9]{64}/;

function segmentLooksLikeOrder(segment: string): boolean {
  return (
    /\b(?:limit\s+order|market\s+order|place\s+(?:the\s+)?order|click\s+(?:the\s+)?order)\b/i.test(
      segment,
    ) || /\b(?:buy|sell)\s+[\d.,]+\s*(?:SUI|USDC|DEEP|WAL|USDT)\b/i.test(segment)
  );
}

function parseLimitOrderSegment(segment: string): WorkflowExecuteStep | null {
  const clickOrPlaceBuy = segment.match(
    new RegExp(
      `(?:click|place)\\s+(?:the\\s+)?(?:limit\\s+)?order\\s+to\\s+buy\\s+([\\d.,]+)\\s*(${COIN})\\s+at\\s+([\\d.,]+)`,
      "i",
    ),
  );
  if (clickOrPlaceBuy) {
    const quantity = Number(clickOrPlaceBuy[1].replace(/,/g, ""));
    const price = Number(clickOrPlaceBuy[3].replace(/,/g, ""));
    const pool = segment.match(/(SUI[_\s/]*USDC|DEEP[_\s/]*USDC)/i);
    return {
      kind: "execute",
      label: `Limit buy ${quantity} ${clickOrPlaceBuy[2].toUpperCase()} @ ${price}`,
      input: {
        chain_id: "sui",
        action: "deepbook_place_limit_order",
        params: {
          pool_key: pool ? normalizePoolKey(pool[0]) : getDeepBookEnv().defaultPool,
          quantity,
          price,
          side: "buy",
        },
      },
    };
  }

  const buyMatch = segment.match(
    new RegExp(
      `(?:place\\s+(?:a\\s+)?limit\\s+order\\s+to\\s+)?buy\\s+([\\d.,]+)\\s*(${COIN})\\s+at\\s+([\\d.,]+)\\s*(?:(${COIN})|(?:usdc|usd))`,
      "i",
    ),
  );
  if (buyMatch) {
    const quantity = Number(buyMatch[1].replace(/,/g, ""));
    const price = Number(buyMatch[3].replace(/,/g, ""));
    const pool = segment.match(/(SUI[_\s/]*USDC|DEEP[_\s/]*USDC)/i);
    return {
      kind: "execute",
      label: `Limit buy ${quantity} ${buyMatch[2].toUpperCase()} @ ${price}`,
      input: {
        chain_id: "sui",
        action: "deepbook_place_limit_order",
        params: {
          pool_key: pool ? normalizePoolKey(pool[0]) : getDeepBookEnv().defaultPool,
          quantity,
          price,
          side: "buy",
        },
      },
    };
  }

  const sellMatch = segment.match(
    new RegExp(
      `(?:place\\s+(?:a\\s+)?limit\\s+order\\s+to\\s+)?sell\\s+([\\d.,]+)\\s*(${COIN})\\s+at\\s+([\\d.,]+)`,
      "i",
    ),
  );
  if (sellMatch) {
    const quantity = Number(sellMatch[1].replace(/,/g, ""));
    const price = Number(sellMatch[3].replace(/,/g, ""));
    const pool = segment.match(/(SUI[_\s/]*USDC|DEEP[_\s/]*USDC)/i);
    return {
      kind: "execute",
      label: `Limit sell ${quantity} ${sellMatch[2].toUpperCase()} @ ${price}`,
      input: {
        chain_id: "sui",
        action: "deepbook_place_limit_order",
        params: {
          pool_key: pool ? normalizePoolKey(pool[0]) : getDeepBookEnv().defaultPool,
          quantity,
          price,
          side: "sell",
        },
      },
    };
  }

  const genericLimit = segment.match(
    /limit\s+order.*?(buy|sell)\s+([\d.,]+).*?(?:at|@)\s*([\d.,]+)/i,
  );
  if (genericLimit) {
    const side = genericLimit[1].toLowerCase() as "buy" | "sell";
    const quantity = Number(genericLimit[2].replace(/,/g, ""));
    const price = Number(genericLimit[3].replace(/,/g, ""));
    return {
      kind: "execute",
      label: `Limit ${side} ${quantity} @ ${price}`,
      input: {
        chain_id: "sui",
        action: "deepbook_place_limit_order",
        params: {
          pool_key: getDeepBookEnv().defaultPool,
          quantity,
          price,
          side,
        },
      },
    };
  }

  const buyAtQuote = segment.match(
    new RegExp(
      `(?:order\\s+to\\s+)?buy\\s+([\\d.,]+)\\s*(${COIN})\\s+at\\s+(?:usdc|usd|USDC)(?:\\b|\\s+on\\b)`,
      "i",
    ),
  );
  if (buyAtQuote) {
    const quantity = Number(buyAtQuote[1].replace(/,/g, ""));
    const pool = segment.match(/(SUI[_\s/]*USDC|DEEP[_\s/]*USDC)/i);
    return {
      kind: "execute",
      label: `Limit buy ${quantity} ${buyAtQuote[2].toUpperCase()}`,
      input: {
        chain_id: "sui",
        action: "deepbook_place_limit_order",
        params: {
          pool_key: pool ? normalizePoolKey(pool[0]) : getDeepBookEnv().defaultPool,
          quantity,
          side: "buy",
        },
      },
    };
  }

  return null;
}

function resolveSwapPoolKeyFromSegment(
  segment: string,
  from: string,
  to: string,
): string {
  const explicit = segment.match(/(SUI[_\s/]*(?:USDC|DBUSDC)|DEEP[_\s/]*(?:USDC|DBUSDC|SUI)|WAL[_\s/]*(?:USDC|DBUSDC|SUI))/i);
  return resolveSwapPoolKey({
    fromCoin: from,
    toCoin: to,
    explicitPoolKey: explicit ? normalizePoolKey(explicit[0]) : null,
  });
}

function inferSwapSide(from: string, to: string, poolKey: string): "buy" | "sell" {
  return inferSwapSideForPool(from, to, poolKey);
}

function parseSwapSegment(segment: string): WorkflowExecuteStep | null {
  const amountAt = segment.match(
    new RegExp(
      `(?:swap|convert|trade|exchange)\\s+([\\d.,]+)\\s*(${COIN})${COIN_SUFFIX}\\s+at\\s+(${COIN})${COIN_SUFFIX}`,
      "i",
    ),
  );
  if (amountAt) {
    const amount = Number(amountAt[1].replace(/,/g, ""));
    const from = amountAt[2].toUpperCase();
    const to = amountAt[3].toUpperCase();
    const poolKey = resolveSwapPoolKeyFromSegment(segment, from, to);
    const side = inferSwapSide(from, to, poolKey);
    return {
      kind: "execute",
      label: `Swap ${amount} ${from} → ${to}`,
      input: {
        chain_id: "sui",
        action: "swap",
        params: {
          pool_key: poolKey,
          amount,
          side,
          input_coin: from,
          output_coin: to,
        },
      },
    };
  }

  const amountSide = segment.match(
    new RegExp(
      `(?:swap|convert|trade|exchange)\\s+([\\d.,]+)\\s*(${COIN})${COIN_SUFFIX}\\s+(?:to|for|into)\\s+(${COIN})${COIN_SUFFIX}`,
      "i",
    ),
  );
  if (amountSide) {
    const amount = Number(amountSide[1].replace(/,/g, ""));
    const from = amountSide[2].toUpperCase();
    const to = amountSide[3].toUpperCase();
    const poolKey = resolveSwapPoolKeyFromSegment(segment, from, to);
    const side = inferSwapSide(from, to, poolKey);
    return {
      kind: "execute",
      label: `Swap ${amount} ${from} → ${to}`,
      input: {
        chain_id: "sui",
        action: "swap",
        params: {
          pool_key: poolKey,
          amount,
          side,
          input_coin: from,
          output_coin: to,
        },
      },
    };
  }

  const genericAmount = segment.match(
    new RegExp(`(?:swap|convert|trade|exchange)\\s+([\\d.,]+)`, "i"),
  );
  if (genericAmount) {
    const amount = Number(genericAmount[1].replace(/,/g, ""));
    return {
      kind: "execute",
      label: `Swap ${amount}`,
      input: {
        chain_id: "sui",
        action: "swap",
        params: {
          pool_key: getDeepBookEnv().defaultPool,
          amount,
          side: "sell",
        },
      },
    };
  }

  return null;
}

/** Parse a single-swap message (not multi-step) into an execute step when params are complete. */
export function parseSingleSwapIntent(message: string): WorkflowExecuteStep | null {
  const trimmed = message.trim();
  const swap = parseSwapSegment(trimmed);
  if (!swap) {
    return null;
  }

  const params = swap.input.params as Record<string, unknown>;
  if (
    typeof params.input_coin !== "string" ||
    typeof params.output_coin !== "string" ||
    !Number.isFinite(params.amount as number)
  ) {
    return null;
  }

  return swap;
}

/** True when the message states a concrete on-chain swap (amount + coin pair), not a UI/build request. */
export function messageHasExecutableSwapIntent(message: string): boolean {
  return parseSingleSwapIntent(message) !== null;
}

const BUILD_VERB_PATTERN = /\b(build|create|make|design|develop|implement|scaffold|generate)\b/i;
const BUILD_SUBJECT_PATTERN =
  /\b(app|ui|interface|dashboard|page|widget|dex|uniswap|swap\s+app|deepbook|artifact|preview|tabs?)\b/i;

/** True when the user wants a React artifact generated — not an immediate wallet swap. */
export function messageHasBuildAppIntent(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (messageHasExecutableSwapIntent(trimmed)) return false;
  if (!BUILD_VERB_PATTERN.test(trimmed)) return false;

  if (/\b(like|similar to)\s+uniswap\b/i.test(trimmed)) return true;
  if (/\btabs?\s+for\b/i.test(trimmed)) return true;
  if (/\bdeepbook\b/i.test(trimmed) && /\bswap\b/i.test(trimmed)) return true;
  if (/\b(flash\s+loan|stake|governance|open\s+orders?)\b/i.test(trimmed) && BUILD_SUBJECT_PATTERN.test(trimmed)) {
    return true;
  }

  return BUILD_SUBJECT_PATTERN.test(trimmed);
}

/** User asked to persist the generated app to Projects (not just chat preview). */
export function messageRequestsSaveToProjects(message: string): boolean {
  return (
    /\bsave(?:\s+it)?\s+to\s+(?:my\s+)?projects?\b/i.test(message) ||
    /\bsave\s+this\s+(?:to\s+)?projects?\b/i.test(message) ||
    /\bkeep\s+it\s+in\s+projects?\b/i.test(message)
  );
}

function parseTransferSegment(segment: string): WorkflowExecuteStep | null {
  const sendMatch = segment.match(
    new RegExp(
      `(?:send|transfer)\\s+([\\d.,]+)\\s*(${COIN})\\s+(?:to\\s+)?(${SUI_ADDRESS.source})`,
      "i",
    ),
  );
  if (sendMatch) {
    const amount = Number(sendMatch[1].replace(/,/g, ""));
    const coin = sendMatch[2].toUpperCase();
    const recipient = sendMatch[3];
    if (coin !== "SUI") {
      return null;
    }
    const amountMist = BigInt(Math.floor(amount * 1_000_000_000)).toString();
    return {
      kind: "execute",
      label: `Send ${amount} SUI to ${recipient.slice(0, 10)}…`,
      input: {
        chain_id: "sui",
        action: "transfer_sui",
        params: { recipient, amount_mist: amountMist },
      },
    };
  }
  return null;
}

function parseCancelSegment(segment: string): WorkflowExecuteStep | null {
  if (/\bcancel\s+all\b/i.test(segment)) {
    const pool = segment.match(/(SUI[_\s/]*USDC|DEEP[_\s/]*USDC)/i);
    return {
      kind: "execute",
      label: "Cancel all open orders",
      input: {
        chain_id: "sui",
        action: "deepbook_cancel_all_orders",
        params: {
          pool_key: pool ? normalizePoolKey(pool[0]) : getDeepBookEnv().defaultPool,
        },
      },
    };
  }

  const orderId = segment.match(/\b(?:order\s+)?(?:id\s+)?([0-9a-fx]{8,})/i);
  if (/\bcancel\b/i.test(segment) && orderId) {
    return {
      kind: "execute",
      label: `Cancel order ${orderId[1].slice(0, 12)}…`,
      input: {
        chain_id: "sui",
        action: "deepbook_cancel_order",
        params: { order_id: orderId[1] },
      },
    };
  }

  return null;
}

function parseQuerySegment(segment: string): WorkflowQueryStep | null {
  if (segmentLooksLikeOrder(segment)) {
    return null;
  }

  if (/\bopen\s+orders?\b/i.test(segment)) {
    const pool = segment.match(/(SUI[_\s/]*USDC|DEEP[_\s/]*USDC)/i);
    return {
      kind: "query",
      label: "Open orders",
      input: {
        chain_id: "sui",
        query: "deepbook_open_orders",
        params: pool ? { pool_key: normalizePoolKey(pool[0]) } : {},
      },
    };
  }

  if (userAskedMarketPrice(segment) && parseSwapSegment(segment) === null) {
    const pool = segment.match(/(SUI[_\s/]*USDC|DEEP[_\s/]*USDC)/i);
    return {
      kind: "query",
      label: "Pool market info",
      input: {
        chain_id: "sui",
        query: "deepbook_pool_info",
        params: pool ? { pool_key: normalizePoolKey(pool[0]) } : {},
      },
    };
  }

  if (parseSwapSegment(segment) !== null && /\b(quote|price|rate)\b/i.test(segment)) {
    const amountMatch = segment.match(new RegExp(`([\\d.,]+)\\s*(${COIN})`, "i"));
    if (amountMatch) {
      return {
        kind: "query",
        label: "Swap quote",
        input: {
          chain_id: "sui",
          query: "swap_quote",
          params: {
            pool_key: getDeepBookEnv().defaultPool,
            amount: Number(amountMatch[1].replace(/,/g, "")),
            side: "sell",
          },
        },
      };
    }
  }

  if (/\b(manager\s+)?balance/i.test(segment) && /\bdeepbook\b/i.test(segment)) {
    const coin = segment.match(new RegExp(`\\b(${COIN})\\b`, "i"));
    return {
      kind: "query",
      label: "DeepBook manager balance",
      input: {
        chain_id: "sui",
        query: "deepbook_manager_balance",
        params: coin ? { coin_key: coin[1].toUpperCase() } : {},
      },
    };
  }

  if (
    /\b(wallet\s+)?balance/i.test(segment) ||
    (/\b(tell\s+me|show\s+me|check|what(?:'s| is))\b/i.test(segment) &&
      /\b(balance|balances|wallet|portfolio|holdings)\b/i.test(segment))
  ) {
    return {
      kind: "query",
      label: "Wallet token balances",
      input: {
        chain_id: "sui",
        query: "token_balances",
        params: { include_zero: false },
      },
    };
  }

  return null;
}

function parseBuildSegment(segment: string): WorkflowBuildStep | null {
  if (!/\b(build|create|make|design|develop|implement)\b/i.test(segment)) {
    return null;
  }

  if (
    /^\s*swap\b/i.test(segment.trim()) &&
    !/\b(ui|app|interface|dashboard|page|widget|uniswap|like)\b/i.test(segment)
  ) {
    return null;
  }

  return {
    kind: "build",
    label: segment.length > 60 ? `${segment.slice(0, 57)}…` : segment,
    instruction: segment,
  };
}

export function classifyWorkflowSegment(segment: string): WorkflowStep {
  const deposit = extractDepositIntent(segment);
  if (deposit) {
    return {
      kind: "execute",
      label: `Deposit ${deposit.amount_display} ${deposit.coin_key}`,
      input: {
        chain_id: "sui",
        action: "deepbook_deposit",
        params: {
          coin_key: deposit.coin_key,
          amount_display: deposit.amount_display,
        },
      },
    };
  }

  const withdraw = extractWithdrawIntent(segment);
  if (withdraw) {
    return {
      kind: "execute",
      label: withdraw.withdraw_all
        ? `Withdraw all ${withdraw.coin_key}`
        : `Withdraw ${withdraw.amount_display} ${withdraw.coin_key}`,
      input: {
        chain_id: "sui",
        action: "deepbook_withdraw",
        params: withdraw.withdraw_all
          ? { coin_key: withdraw.coin_key, withdraw_all: true }
          : {
              coin_key: withdraw.coin_key,
              amount_display: withdraw.amount_display,
            },
      },
    };
  }

  const limit = parseLimitOrderSegment(segment);
  if (limit) return limit;

  const swap = parseSwapSegment(segment);
  if (swap) return swap;

  const transfer = parseTransferSegment(segment);
  if (transfer) return transfer;

  const cancel = parseCancelSegment(segment);
  if (cancel) return cancel;

  if (/\b(?:set\s+up|provision|create)\b.*\bbalance\s+manager\b/i.test(segment)) {
    return {
      kind: "execute",
      label: "Provision DeepBook balance manager",
      input: {
        chain_id: "sui",
        action: "deepbook_provision_manager",
        params: {},
      },
    };
  }

  const query = parseQuerySegment(segment);
  if (query) return query;

  const build = parseBuildSegment(segment);
  if (build) return build;

  const agentStep: WorkflowAgentStep = {
    kind: "agent",
    label: segment.length > 60 ? `${segment.slice(0, 57)}…` : segment,
    instruction: segment,
  };
  return agentStep;
}
