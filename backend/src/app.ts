import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { correlationIdMiddleware } from "./api/middleware/correlation-id.js";
import { csrfOriginMiddleware } from "./api/middleware/csrf-origin.js";
import { inngestNetworkGuardMiddleware } from "./api/middleware/inngest-network-guard.js";
import { errorHandlerMiddleware } from "./api/middleware/error-handler.js";
import { requestLoggerMiddleware } from "./api/middleware/request-logger.js";
import { createSecurityHeadersMiddleware } from "./config/security-headers.js";
import { authLogoutRouter } from "./api/routes/v1/auth/logout.js";
import { agentPermissionsRouter } from "./api/routes/v1/agent/permissions.js";
import { agentTransactionsRouter } from "./api/routes/v1/agent/transactions.js";
import { authMeRouter } from "./api/routes/v1/auth/me.js";
import { authExportRouter } from "./api/routes/v1/auth/export.js";
import { authRegisterWalletRouter } from "./api/routes/v1/auth/register-wallet.js";
import { walletAssetsRouter } from "./api/routes/v1/wallets/assets.js";
import { walletBalancesRouter } from "./api/routes/v1/wallets/balances.js";
import { walletSignAndSendRouter } from "./api/routes/v1/wallets/sign-and-send.js";
import { healthRouter } from "./api/routes/health.js";
import { chatRouter } from "./api/routes/v1/chat/chat.js";
import { chatSessionsRouter } from "./api/routes/v1/chat/sessions.js";
import { privyWebhookRouter } from "./api/routes/v1/webhooks/privy.js";
import { notificationsWebhookRouter } from "./api/routes/v1/webhooks/notifications.js";
import { defiBalanceManagerRouter } from "./api/routes/v1/defi/balance-manager.js";
import { defiPoolsRouter } from "./api/routes/v1/defi/pools.js";
import { proxyRouter } from "./api/routes/v1/proxy/proxy.js";
import { notificationsRouter } from "./api/routes/v1/notifications/notifications.js";
import { createCorsOptions } from "./config/cors.js";
import { getInngestConfig } from "./config/inngest.js";
import { inngest } from "./inngest/client.js";
import { inngestFunctions } from "./inngest/functions/index.js";
import { serve } from "inngest/express";

/** Express app without DB connect or workers (for tests and main entry). */
export function createApp() {
  const app = express();

  app.use(createSecurityHeadersMiddleware());
  app.use(cors(createCorsOptions()));
  app.use(
    "/api/v1/webhooks/privy",
    express.raw({ type: "application/json" }),
    privyWebhookRouter,
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(cookieParser());
  app.use(correlationIdMiddleware);
  app.use(csrfOriginMiddleware);
  app.use(requestLoggerMiddleware);
  app.use("/api/v1/webhooks/notifications", notificationsWebhookRouter);

  if (getInngestConfig().enabled) {
    app.use(
      "/api/inngest",
      inngestNetworkGuardMiddleware,
      serve({
        client: inngest,
        functions: inngestFunctions,
      }),
    );
  }

  app.use(healthRouter);
  app.use(authMeRouter);
  app.use(authExportRouter);
  app.use(agentPermissionsRouter);
  app.use(agentTransactionsRouter);
  app.use(authRegisterWalletRouter);
  app.use(authLogoutRouter);
  app.use(walletBalancesRouter);
  app.use(walletAssetsRouter);
  app.use(walletSignAndSendRouter);
  app.use(chatRouter);
  app.use(chatSessionsRouter);
  app.use(defiPoolsRouter);
  app.use(defiBalanceManagerRouter);
  app.use(proxyRouter);
  app.use(notificationsRouter);
  app.use(errorHandlerMiddleware);

  return app;
}
