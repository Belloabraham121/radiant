import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import { getDeepBookSwapQuote } from "../defi/deepbook/deepbook-swap.service.js";
import { getDeepBookPoolInfo } from "../defi/deepbook/deepbook-pools.service.js";
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
