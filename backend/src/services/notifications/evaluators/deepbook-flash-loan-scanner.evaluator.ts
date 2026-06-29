import { getDeepBookEnv } from "../../../config/deepbook.js";
import { getFlashLoanBundleQuote } from "../../defi/deepbook/deepbook-flash-loan-quote.js";
import { resolvePoolCoins } from "../../defi/deepbook/deepbook-flash-loan.types.js";
import type {
  NotificationEmitCandidate,
  NotificationEvaluator,
  PollRuleEvaluationContext,
} from "../notification-evaluator.types.js";
import { renderNotificationPresentation } from "../notification-presentation.service.js";

export const DEEPBOOK_FLASH_LOAN_SCANNER_KEY = "deepbook.flash_loan_scanner";

const DEFAULT_BORROW_AMOUNT = 100;
const DEFAULT_SLIPPAGE_BPS = 50;

function readRuleCondition(rule: PollRuleEvaluationContext["rule"]): Record<string, unknown> {
  const condition = rule.condition;
  if (typeof condition === "object" && condition !== null && !Array.isArray(condition)) {
    return condition as Record<string, unknown>;
  }
  return {};
}

function resolvePoolKeys(condition: Record<string, unknown>): string[] {
  const configured = condition.pool_keys;
  if (Array.isArray(configured) && configured.length > 0) {
    return configured.filter((value): value is string => typeof value === "string" && value.length > 0);
  }

  return Object.keys(getDeepBookEnv().pools);
}

function resolveBorrowAmount(condition: Record<string, unknown>): number {
  const value = condition.borrow_amount;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  return DEFAULT_BORROW_AMOUNT;
}

function resolveMinProfitBps(condition: Record<string, unknown>): number {
  const value = condition.min_profit_bps;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return 0;
}

function profitBps(surplus: number, borrowAmount: number): number {
  if (borrowAmount <= 0) {
    return 0;
  }
  return Math.round((surplus / borrowAmount) * 10_000);
}

function defaultBorrowAsset(poolKey: string): "base" | "quote" {
  const pool = resolvePoolCoins(poolKey);
  return pool.quote_coin === "USDC" || pool.quote_coin.endsWith("USDC") ? "quote" : "base";
}

function buildRouteSummary(poolKey: string, steps: Array<{ pool_key: string; side: string }>): string {
  if (steps.length === 0) {
    return `Borrow from ${poolKey}`;
  }
  const hops = steps.map((step) => `${step.pool_key}:${step.side}`).join(" → ");
  return `${poolKey} → ${hops}`;
}

function buildOpportunityId(poolKey: string, profitBpsValue: number, borrowAmount: number): string {
  return `${poolKey}:${borrowAmount}:${profitBpsValue}`;
}

async function evaluatePollRule(
  context: PollRuleEvaluationContext,
): Promise<NotificationEmitCandidate | null> {
  const condition = readRuleCondition(context.rule);
  const minProfitBps = resolveMinProfitBps(condition);
  const borrowAmount = resolveBorrowAmount(condition);
  const poolKeys = resolvePoolKeys(condition);

  let best:
    | {
        poolKey: string;
        profitBps: number;
        surplus: number;
        coinKey: string;
        routeSummary: string;
      }
    | undefined;

  for (const poolKey of poolKeys) {
    try {
      const asset = defaultBorrowAsset(poolKey);
      const quote = await getFlashLoanBundleQuote(
        context.privyUserId,
        {
          pool_key: poolKey,
          borrow_amount: borrowAmount,
          asset,
          strategy: "swap_chain_repay",
          slippage_bps: DEFAULT_SLIPPAGE_BPS,
        },
        { emitProgress: false, advisoryQuote: true },
      );

      if (!quote.repay_feasible || quote.estimated_surplus == null || quote.estimated_surplus <= 0) {
        continue;
      }

      const bps = profitBps(quote.estimated_surplus, quote.borrow_amount);
      if (bps < minProfitBps) {
        continue;
      }

      const routeSummary = buildRouteSummary(
        quote.pool_key,
        quote.steps.map((step: { pool_key: string; side: string }) => ({
          pool_key: step.pool_key,
          side: step.side,
        })),
      );

      if (!best || bps > best.profitBps) {
        best = {
          poolKey: quote.pool_key,
          profitBps: bps,
          surplus: quote.estimated_surplus,
          coinKey: quote.coin_key,
          routeSummary,
        };
      }
    } catch {
      // Skip pools that fail quote validation for this user/amount.
    }
  }

  if (!best) {
    return null;
  }

  const opportunityId = buildOpportunityId(best.poolKey, best.profitBps, borrowAmount);
  const presentationVars = {
    profit_bps: best.profitBps,
    profit_display: `${best.surplus.toFixed(4)} ${best.coinKey}`,
    route_summary: best.routeSummary,
    opportunity_id: opportunityId,
    pool_key: best.poolKey,
  };

  const rendered = renderNotificationPresentation(
    context.typeDefinition.presentation,
    presentationVars,
    {
      title: `Flash arb ${best.profitBps} bps`,
      body: `${best.routeSummary} — est. surplus ${best.surplus.toFixed(4)} ${best.coinKey}`,
      deep_link: "/app/chat",
    },
  );

  return {
    rule_id: context.rule.id,
    user_id: context.rule.user_id,
    notification_type: context.rule.notification_type,
    title: rendered.title,
    body: rendered.body,
    payload: {
      severity: "info",
      data: {
        pool_key: best.poolKey,
        profit_bps: best.profitBps,
        estimated_surplus: best.surplus,
        coin_key: best.coinKey,
        route_summary: best.routeSummary,
        opportunity_id: opportunityId,
      },
      ...(rendered.deep_link ? { deep_link: rendered.deep_link } : {}),
      rule_id: context.rule.id,
    },
    idempotency_key: `poll:${context.rule.id}:${opportunityId}`,
  };
}

export const deepbookFlashLoanScannerEvaluator: NotificationEvaluator = {
  key: DEEPBOOK_FLASH_LOAN_SCANNER_KEY,
  async evaluate(rules: PollRuleEvaluationContext[]): Promise<NotificationEmitCandidate[]> {
    const candidates: NotificationEmitCandidate[] = [];

    for (const context of rules) {
      const candidate = await evaluatePollRule(context);
      if (candidate) {
        candidates.push(candidate);
      }
    }

    return candidates;
  },
};
