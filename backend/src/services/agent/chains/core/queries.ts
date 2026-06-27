import { AppError } from "../../../../errors/app-error.js";
import { getAdapter } from "../../../chains/registry.js";
import { queryAgentTransactions } from "../../../agent-transaction/agent-transaction.service.js";
import { getWalletAssetsForPrivyUser } from "../../../wallet/wallet-assets.service.js";
import { findUserByPrivyId } from "../../../auth/user.repository.js";
import { findProjectByIdForUser } from "../../../projects/project.repository.js";
import { buildProjectActionsCatalogResponse } from "../../../projects/app-action-schema.service.js";
import { buildProjectNotificationSchemaResponse } from "../../../notifications/notification-schema.service.js";
import {
  listAppActionsCatalogForPinnedScope,
  listAppActionsCatalogForSession,
} from "../../../projects/app-action-catalog.service.js";
import { resolveAppScope } from "../../../projects/app-scope-resolver.service.js";
import {
  queryBridgeCapabilities,
  querySupportedChains,
  queryTokenResolve,
} from "../../../defi/token-resolve.service.js";
import type {
  AgentTransactionCategory,
  AgentTransactionStatus,
} from "../../../agent-transaction/agent-transaction.types.js";
import type { ChainId } from "../../../chains/types.js";
import type { ChainQueryHandler, QueryHandlerContext } from "../types.js";
import { CORE_QUERY_SCHEMA, CORE_QUERY_TYPES } from "./query-schema.js";

function handleBalance(ctx: QueryHandlerContext) {
  const adapter = getAdapter(ctx.chainId);
  return adapter.getBalance(ctx.walletAddress, ctx.balanceContext);
}

function handleTokenBalances(ctx: QueryHandlerContext) {
  return getWalletAssetsForPrivyUser(ctx.privyUserId, {
    chain_id: ctx.chainId,
    evm_chain_id: ctx.params.evm_chain_id as number | undefined,
    include_zero: ctx.params.include_zero as boolean | undefined,
    include_usd: ctx.params.include_usd as boolean | undefined,
  });
}

function handleAgentTransactions(ctx: QueryHandlerContext) {
  return queryAgentTransactions(ctx.privyUserId, {
    chainId: ctx.chainId,
    limit: ctx.params.limit as number | undefined,
    status: ctx.params.status as AgentTransactionStatus | undefined,
    category: ctx.params.category as AgentTransactionCategory | undefined,
    sessionId: ctx.params.session_id as string | undefined,
    transactionId: ctx.params.transaction_id as string | undefined,
  });
}

async function handleTokenResolve(ctx: QueryHandlerContext) {
  const symbol = String(
    ctx.params.symbol ?? ctx.params.token ?? ctx.params.input ?? "",
  ).trim();
  if (!symbol) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "token_resolve requires params.symbol (or token / input).",
    );
  }
  return queryTokenResolve(ctx.privyUserId, {
    chain_id: ctx.chainId,
    symbol,
    evm_chain_id: ctx.params.evm_chain_id as number | undefined,
    to_chain_id: ctx.params.to_chain_id as typeof ctx.chainId | undefined,
    to_evm_chain_id: ctx.params.to_evm_chain_id as number | undefined,
  });
}

async function handleBridgeCapabilities(ctx: QueryHandlerContext) {
  const fromChainId = ctx.params.from_chain_id as ChainId | undefined;
  const toChainId = ctx.params.to_chain_id as ChainId | undefined;
  if (!fromChainId || !toChainId) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "bridge_capabilities requires params.from_chain_id and params.to_chain_id.",
    );
  }
  return queryBridgeCapabilities({
    from_chain_id: fromChainId,
    from_evm_chain_id: ctx.params.from_evm_chain_id as number | undefined,
    to_chain_id: toChainId,
    to_evm_chain_id: ctx.params.to_evm_chain_id as number | undefined,
    from_token: ctx.params.from_token as string | undefined,
  });
}

async function handleProjectOrSessionActions(ctx: QueryHandlerContext) {
  const useSession = ctx.query === "session_actions";
  const projectId = ctx.params.project_id as string | undefined;
  const appName = ctx.params.app_name as string | undefined;

  if (ctx.options?.pinnedAppScope) {
    return listAppActionsCatalogForPinnedScope(
      ctx.privyUserId,
      ctx.options.pinnedAppScope,
      ctx.options.sessionId,
    );
  }

  if (!useSession && projectId) {
    const user = await findUserByPrivyId(ctx.privyUserId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found");
    }

    const project = await findProjectByIdForUser(projectId, user.id);
    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    }

    return buildProjectActionsCatalogResponse(project);
  }

  if (!ctx.options?.sessionId) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      useSession
        ? "session_actions requires an active chat session."
        : "project_actions requires params.project_id (UUID) or params.app_name with a chat session.",
    );
  }

  const scope = await resolveAppScope(ctx.privyUserId, ctx.options.sessionId, {
    project_id: useSession ? undefined : projectId,
    app_name: appName,
    use_session_draft: useSession || (!projectId && !appName),
  });

  if (scope.kind === "project") {
    const user = await findUserByPrivyId(ctx.privyUserId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found");
    }
    const project = await findProjectByIdForUser(scope.project_id, user.id);
    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    }
    return buildProjectActionsCatalogResponse(project);
  }

  return listAppActionsCatalogForSession(ctx.privyUserId, scope.session_id);
}

async function handleProjectNotificationSchema(ctx: QueryHandlerContext) {
  const projectId = ctx.params.project_id as string | undefined;
  const appName = ctx.params.app_name as string | undefined;

  if (ctx.options?.pinnedAppScope?.kind === "project") {
    const user = await findUserByPrivyId(ctx.privyUserId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found");
    }
    const project = await findProjectByIdForUser(
      ctx.options.pinnedAppScope.project_id,
      user.id,
    );
    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    }
    return { schema: buildProjectNotificationSchemaResponse(project) };
  }

  if (ctx.options?.pinnedAppScope?.kind === "installation") {
    const { findInstallationForUser } = await import("../../../apps/app-installation.repository.js");
    const user = await findUserByPrivyId(ctx.privyUserId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found");
    }
    const installation = await findInstallationForUser(
      ctx.options.pinnedAppScope.installation_id,
      user.id,
    );
    if (!installation) {
      throw new AppError(404, "INSTALLATION_NOT_FOUND", "Installation not found");
    }
    return { schema: buildProjectNotificationSchemaResponse(installation.source_project) };
  }

  if (projectId) {
    const user = await findUserByPrivyId(ctx.privyUserId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found");
    }
    const project = await findProjectByIdForUser(projectId, user.id);
    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
    }
    return { schema: buildProjectNotificationSchemaResponse(project) };
  }

  if (!ctx.options?.sessionId) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "project_notification_schema requires params.project_id (UUID) or params.app_name with a chat session.",
    );
  }

  const scope = await resolveAppScope(ctx.privyUserId, ctx.options.sessionId, {
    app_name: appName,
  });

  if (scope.kind !== "project") {
    throw new AppError(
      404,
      "NOTIFICATION_SCHEMA_NOT_FOUND",
      "Notification schema is only available for saved projects — save the app to Projects first.",
    );
  }

  const user = await findUserByPrivyId(ctx.privyUserId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }
  const project = await findProjectByIdForUser(scope.project_id, user.id);
  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found");
  }
  return { schema: buildProjectNotificationSchemaResponse(project) };
}

const CORE_QUERY_HANDLERS: Record<string, ChainQueryHandler> = {
  balance: handleBalance,
  native_balance: handleBalance,
  token_balances: handleTokenBalances,
  agent_transactions: handleAgentTransactions,
  token_resolve: handleTokenResolve,
  bridge_capabilities: handleBridgeCapabilities,
  supported_chains: async () => querySupportedChains(),
  project_actions: handleProjectOrSessionActions,
  session_actions: handleProjectOrSessionActions,
  project_notification_schema: handleProjectNotificationSchema,
};

export function isCoreQueryType(query: string): query is (typeof CORE_QUERY_TYPES)[number] {
  return (CORE_QUERY_TYPES as readonly string[]).includes(query);
}

export function getCoreQueryHandler(query: string): ChainQueryHandler | null {
  return CORE_QUERY_HANDLERS[query] ?? null;
}

export const coreQueryRegistration = {
  chainIds: ["sui", "ethereum", "solana", "stellar"] as const,
  queryTypes: CORE_QUERY_TYPES,
  handler: async (ctx: QueryHandlerContext) => {
    const handler = getCoreQueryHandler(ctx.query);
    if (!handler) {
      throw new AppError(400, "UNSUPPORTED_QUERY", `Unsupported core query: ${ctx.query}`);
    }
    return handler(ctx);
  },
  schema: {
    queryTypes: CORE_QUERY_TYPES,
    description: CORE_QUERY_SCHEMA.description,
    paramsDescription: CORE_QUERY_SCHEMA.paramsDescription,
  },
};
