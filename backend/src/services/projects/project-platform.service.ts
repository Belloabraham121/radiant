import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import { getDeepBookSwapQuote } from "../defi/deepbook/deepbook-swap.service.js";
import { getDeepBookPoolInfo } from "../defi/deepbook/deepbook-pools.service.js";
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
