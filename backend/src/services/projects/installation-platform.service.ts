import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import { getFlashLoanBundleQuote } from "../defi/deepbook/deepbook-flash-loan-quote.js";
import { getDeepBookGovernanceState } from "../defi/deepbook/deepbook-governance.service.js";
import { getDeepBookOpenOrders } from "../defi/deepbook/deepbook-orders.service.js";
import { getDeepBookSwapQuote } from "../defi/deepbook/deepbook-swap.service.js";
import { getDeepBookPoolInfo } from "../defi/deepbook/deepbook-pools.service.js";
import { getDeepBookStakeBalance } from "../defi/deepbook/deepbook-stake.service.js";
import { findUserByPrivyId } from "../auth/user.repository.js";
import { findInstallationForUser } from "../apps/app-installation.repository.js";

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

async function assertInstallationAccess(privyUserId: string, installationId: string) {
  const user = await findUserByPrivyId(privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  const installation = await findInstallationForUser(installationId, user.id);
  if (!installation) {
    throw new AppError(404, "INSTALLATION_NOT_FOUND", "Installation not found");
  }

  const source = installation.source_project;
  if (!source.is_public || source.status !== "live") {
    throw new AppError(410, "APP_UNAVAILABLE", "This app is no longer available");
  }

  return { user, installation, source };
}

/** Installation-scoped swap quote — caller's wallet, not the app owner. */
export async function swapQuoteForInstallation(
  privyUserId: string,
  installationId: string,
  body: unknown,
) {
  await assertInstallationAccess(privyUserId, installationId);
  const params = swapQuoteBodySchema.parse(body);
  return getDeepBookSwapQuote(privyUserId, params);
}

/** Installation-scoped pool info for installed app UIs. */
export async function poolInfoForInstallation(
  privyUserId: string,
  installationId: string,
  query: unknown,
) {
  await assertInstallationAccess(privyUserId, installationId);
  const { pool_key } = poolInfoQuerySchema.parse(query);
  return getDeepBookPoolInfo(pool_key, privyUserId);
}

export async function flashLoanQuoteForInstallation(
  privyUserId: string,
  installationId: string,
  body: unknown,
) {
  await assertInstallationAccess(privyUserId, installationId);
  const params = flashLoanQuoteBodySchema.parse(body);
  return getFlashLoanBundleQuote(privyUserId, params, { advisoryQuote: true });
}

export async function openOrdersForInstallation(
  privyUserId: string,
  installationId: string,
  query: unknown,
) {
  await assertInstallationAccess(privyUserId, installationId);
  const { pool_key } = poolInfoQuerySchema.parse(query);
  return getDeepBookOpenOrders(privyUserId, { pool_key });
}

export async function stakeBalanceForInstallation(
  privyUserId: string,
  installationId: string,
  query: unknown,
) {
  await assertInstallationAccess(privyUserId, installationId);
  const { pool_key } = poolInfoQuerySchema.parse(query);
  return getDeepBookStakeBalance(privyUserId, { pool_key });
}

export async function governanceStateForInstallation(
  privyUserId: string,
  installationId: string,
  query: unknown,
) {
  await assertInstallationAccess(privyUserId, installationId);
  const { pool_key } = poolInfoQuerySchema.parse(query);
  return getDeepBookGovernanceState(privyUserId, { pool_key });
}
