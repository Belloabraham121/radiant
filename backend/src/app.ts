import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { correlationIdMiddleware } from "./api/middleware/correlation-id.js";
import { errorHandlerMiddleware } from "./api/middleware/error-handler.js";
import { requestLoggerMiddleware } from "./api/middleware/request-logger.js";
import { authLogoutRouter } from "./api/routes/v1/auth/logout.js";
import { agentPermissionsRouter } from "./api/routes/v1/agent/permissions.js";
import { agentTransactionsRouter } from "./api/routes/v1/agent/transactions.js";
import { authMeRouter } from "./api/routes/v1/auth/me.js";
import { authRegisterWalletRouter } from "./api/routes/v1/auth/register-wallet.js";
import { walletAssetsRouter } from "./api/routes/v1/wallets/assets.js";
import { walletBalancesRouter } from "./api/routes/v1/wallets/balances.js";
import { walletSignAndSendRouter } from "./api/routes/v1/wallets/sign-and-send.js";
import { healthRouter } from "./api/routes/health.js";
import { chatRouter } from "./api/routes/v1/chat/chat.js";
import { chatSessionsRouter } from "./api/routes/v1/chat/sessions.js";
import { privyWebhookRouter } from "./api/routes/v1/webhooks/privy.js";
import { e2bWebhookRouter } from "./api/routes/v1/webhooks/e2b.js";
import { deployRouter } from "./api/routes/v1/deploy/deploy.js";
import { projectsRouter } from "./api/routes/v1/projects/projects.js";
import { defiBalanceManagerRouter } from "./api/routes/v1/defi/balance-manager.js";
import { defiPoolsRouter } from "./api/routes/v1/defi/pools.js";
import { createCorsOptions } from "./config/cors.js";
import { getInngestConfig } from "./config/inngest.js";
import { inngest } from "./inngest/client.js";
import { inngestFunctions } from "./inngest/functions/index.js";
import { serve } from "inngest/express";

/** Express app without DB connect or workers (for tests and main entry). */
export function createApp() {
  const app = express();

  app.use(cors(createCorsOptions()));
  app.use(
    "/api/v1/webhooks/privy",
    express.raw({ type: "application/json" }),
    privyWebhookRouter,
  );
  app.use(
    "/api/v1/webhooks/e2b",
    express.raw({ type: "application/json" }),
    e2bWebhookRouter,
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(cookieParser());
  app.use(correlationIdMiddleware);
  app.use(requestLoggerMiddleware);

  if (getInngestConfig().enabled) {
    app.use(
      "/api/inngest",
      serve({
        client: inngest,
        functions: inngestFunctions,
      }),
    );
  }

  app.use(healthRouter);
  app.use(authMeRouter);
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
  app.use(deployRouter);
  app.use(projectsRouter);
  app.use(errorHandlerMiddleware);

  return app;
}
