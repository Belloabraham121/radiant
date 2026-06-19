import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import { getFlashLoanBundleQuote } from "../defi/deepbook/deepbook-flash-loan-quote.js";
import { getDeepBookGovernanceState } from "../defi/deepbook/deepbook-governance.service.js";
import { getDeepBookOpenOrders } from "../defi/deepbook/deepbook-orders.service.js";
import { getDeepBookSwapQuote } from "../defi/deepbook/deepbook-swap.service.js";
import { getDeepBookPoolInfo } from "../defi/deepbook/deepbook-pools.service.js";
import { getDeepBookStakeBalance, getDeepBookStakeRequired } from "../defi/deepbook/deepbook-stake.service.js";
import {
  getMarginManagerInfoForHttp,
  getMarginOpenOrdersForHttp,
  getMarginPoolInfoForHttp,
  getMarginRiskRatioForHttp,
} from "../defi/deepbook/deepbook-margin-app-read.service.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { findSessionForUser } from "../conversation/session.repository.js";

const swapQuoteBodySchema = z.object({
  pool_key: z.string().min(1).optional(),
  amount: z.number().positive(),
  side: z.enum(["buy", "sell"]),
  input_coin: z.string().min(1).optional(),
  output_coin: z.string().min(1).optional(),
});

const poolInfoQuerySchema = z.object({
  pool_key: z.string().min(1).default("SUI_USDC"),
});

const flashLoanQuoteBodySchema = z.object({
  pool_key: z.string().min(1).optional(),
  borrow_amount: z.number().positive(),
  asset: z.enum(["base", "quote"]).optional(),
  coin_key: z.string().min(1).optional(),
  strategy: z.enum(["round_trip", "swap_chain_repay", "swap_repay"]).default("round_trip"),
  steps: z
    .array(
      z.object({
        pool_key: z.string().min(1),
        side: z.enum(["buy", "sell"]),
        amount: z.number().positive(),
        min_out_display: z.number().optional(),
      }),
    )
    .optional(),
});

async function assertSessionOwner(privyUserId: string, sessionId: string) {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }
  const session = await findSessionForUser(sessionId, user.id);
  if (!session) {
    throw new AppError(404, "SESSION_NOT_FOUND", "Chat session not found");
  }
  return session;
}

/** Chat draft preview — swap quote before the artifact is saved to Projects. */
export async function swapQuoteForSession(
  privyUserId: string,
  sessionId: string,
  body: unknown,
) {
  await assertSessionOwner(privyUserId, sessionId);
  const params = swapQuoteBodySchema.parse(body);
  return getDeepBookSwapQuote(privyUserId, params);
}

export async function poolInfoForSession(
  privyUserId: string,
  sessionId: string,
  query: unknown,
) {
  await assertSessionOwner(privyUserId, sessionId);
  const { pool_key } = poolInfoQuerySchema.parse(query);
  return getDeepBookPoolInfo(pool_key, privyUserId);
}

export async function flashLoanQuoteForSession(
  privyUserId: string,
  sessionId: string,
  body: unknown,
) {
  await assertSessionOwner(privyUserId, sessionId);
  const params = flashLoanQuoteBodySchema.parse(body);
  return getFlashLoanBundleQuote(privyUserId, params, { advisoryQuote: true });
}

export async function openOrdersForSession(
  privyUserId: string,
  sessionId: string,
  query: unknown,
) {
  await assertSessionOwner(privyUserId, sessionId);
  const { pool_key } = poolInfoQuerySchema.parse(query);
  return getDeepBookOpenOrders(privyUserId, { pool_key });
}

export async function stakeBalanceForSession(
  privyUserId: string,
  sessionId: string,
  query: unknown,
) {
  await assertSessionOwner(privyUserId, sessionId);
  const { pool_key } = poolInfoQuerySchema.parse(query);
  return getDeepBookStakeBalance(privyUserId, { pool_key });
}

export async function stakeRequiredForSession(
  privyUserId: string,
  sessionId: string,
  query: unknown,
) {
  await assertSessionOwner(privyUserId, sessionId);
  const { pool_key } = poolInfoQuerySchema.parse(query);
  return getDeepBookStakeRequired(privyUserId, { pool_key });
}

export async function governanceStateForSession(
  privyUserId: string,
  sessionId: string,
  query: unknown,
) {
  await assertSessionOwner(privyUserId, sessionId);
  const { pool_key } = poolInfoQuerySchema.parse(query);
  return getDeepBookGovernanceState(privyUserId, { pool_key });
}

export async function marginManagerInfoForSession(
  privyUserId: string,
  sessionId: string,
  query: unknown,
) {
  await assertSessionOwner(privyUserId, sessionId);
  return getMarginManagerInfoForHttp(privyUserId, query);
}

export async function marginPoolInfoForSession(
  privyUserId: string,
  sessionId: string,
  query: unknown,
) {
  await assertSessionOwner(privyUserId, sessionId);
  return getMarginPoolInfoForHttp(privyUserId, query);
}

export async function marginRiskRatioForSession(
  privyUserId: string,
  sessionId: string,
  query: unknown,
) {
  await assertSessionOwner(privyUserId, sessionId);
  return getMarginRiskRatioForHttp(privyUserId, query);
}

export async function marginOpenOrdersForSession(
  privyUserId: string,
  sessionId: string,
  query: unknown,
) {
  await assertSessionOwner(privyUserId, sessionId);
  return getMarginOpenOrdersForHttp(privyUserId, query);
}
