import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import { getFlashLoanBundleQuote } from "../defi/deepbook/deepbook-flash-loan-quote.js";
import { getDeepBookGovernanceState } from "../defi/deepbook/deepbook-governance.service.js";
import { getDeepBookOpenOrders } from "../defi/deepbook/deepbook-orders.service.js";
import { getDeepBookSwapQuote } from "../defi/deepbook/deepbook-swap.service.js";
import { getDeepBookPoolInfo } from "../defi/deepbook/deepbook-pools.service.js";
import { getDeepBookStakeBalance } from "../defi/deepbook/deepbook-stake.service.js";
import {
  getMarginManagerInfoForHttp,
  getMarginOpenOrdersForHttp,
  getMarginPoolInfoForHttp,
  getMarginRiskRatioForHttp,
} from "../defi/deepbook/deepbook-margin-app-read.service.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { findProjectByIdForUser } from "./project.repository.js";

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

async function assertProjectOwner(privyUserId: string, projectId: string) {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }
  const project = await findProjectByIdForUser(projectId, user.id);
  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  }
  return project;
}

/** Project-scoped swap quote — same DeepBook logic the agent uses, owner-only. */
export async function swapQuoteForProject(
  privyUserId: string,
  projectId: string,
  body: unknown,
) {
  await assertProjectOwner(privyUserId, projectId);
  const params = swapQuoteBodySchema.parse(body);
  return getDeepBookSwapQuote(privyUserId, params);
}

/** Project-scoped pool info for generated app UIs. */
export async function poolInfoForProject(
  privyUserId: string,
  projectId: string,
  query: unknown,
) {
  await assertProjectOwner(privyUserId, projectId);
  const { pool_key } = poolInfoQuerySchema.parse(query);
  return getDeepBookPoolInfo(pool_key, privyUserId);
}

/** Project-scoped flash loan bundle quote for generated app UIs. */
export async function flashLoanQuoteForProject(
  privyUserId: string,
  projectId: string,
  body: unknown,
) {
  await assertProjectOwner(privyUserId, projectId);
  const params = flashLoanQuoteBodySchema.parse(body);
  return getFlashLoanBundleQuote(privyUserId, params, { advisoryQuote: true });
}

/** Project-scoped open orders for generated app UIs. */
export async function openOrdersForProject(
  privyUserId: string,
  projectId: string,
  query: unknown,
) {
  await assertProjectOwner(privyUserId, projectId);
  const { pool_key } = poolInfoQuerySchema.parse(query);
  return getDeepBookOpenOrders(privyUserId, { pool_key });
}

/** Project-scoped DEEP stake balance for generated app UIs. */
export async function stakeBalanceForProject(
  privyUserId: string,
  projectId: string,
  query: unknown,
) {
  await assertProjectOwner(privyUserId, projectId);
  const { pool_key } = poolInfoQuerySchema.parse(query);
  return getDeepBookStakeBalance(privyUserId, { pool_key });
}

/** Project-scoped governance state for generated app UIs. */
export async function governanceStateForProject(
  privyUserId: string,
  projectId: string,
  query: unknown,
) {
  await assertProjectOwner(privyUserId, projectId);
  const { pool_key } = poolInfoQuerySchema.parse(query);
  return getDeepBookGovernanceState(privyUserId, { pool_key });
}

export async function marginManagerInfoForProject(
  privyUserId: string,
  projectId: string,
  query: unknown,
) {
  await assertProjectOwner(privyUserId, projectId);
  return getMarginManagerInfoForHttp(privyUserId, query);
}

export async function marginPoolInfoForProject(
  privyUserId: string,
  projectId: string,
  query: unknown,
) {
  await assertProjectOwner(privyUserId, projectId);
  return getMarginPoolInfoForHttp(privyUserId, query);
}

export async function marginRiskRatioForProject(
  privyUserId: string,
  projectId: string,
  query: unknown,
) {
  await assertProjectOwner(privyUserId, projectId);
  return getMarginRiskRatioForHttp(privyUserId, query);
}

export async function marginOpenOrdersForProject(
  privyUserId: string,
  projectId: string,
  query: unknown,
) {
  await assertProjectOwner(privyUserId, projectId);
  return getMarginOpenOrdersForHttp(privyUserId, query);
}
