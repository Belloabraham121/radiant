import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { correlationIdMiddleware } from "./api/middleware/correlation-id.js";
import { errorHandlerMiddleware } from "./api/middleware/error-handler.js";
import { requestLoggerMiddleware } from "./api/middleware/request-logger.js";
import { authLogoutRouter } from "./api/routes/v1/auth/logout.js";
import { authMeRouter } from "./api/routes/v1/auth/me.js";
import { authRegisterWalletRouter } from "./api/routes/v1/auth/register-wallet.js";
import { walletAssetsRouter } from "./api/routes/v1/wallets/assets.js";
import { walletBalancesRouter } from "./api/routes/v1/wallets/balances.js";
import { walletSignAndSendRouter } from "./api/routes/v1/wallets/sign-and-send.js";
import { healthRouter } from "./api/routes/health.js";
import { chatRouter } from "./api/routes/v1/chat/chat.js";
import { chatSessionsRouter } from "./api/routes/v1/chat/sessions.js";
import { privyWebhookRouter } from "./api/routes/v1/webhooks/privy.js";
import { createCorsOptions } from "./config/cors.js";

/** Express app without DB connect or workers (for tests and main entry). */
export function createApp() {
  const app = express();

  app.use(cors(createCorsOptions()));
  app.use(
    "/api/v1/webhooks/privy",
    express.raw({ type: "application/json" }),
    privyWebhookRouter,
  );
  app.use(express.json());
  app.use(cookieParser());
  app.use(correlationIdMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(healthRouter);
  app.use(authMeRouter);
  app.use(authRegisterWalletRouter);
  app.use(authLogoutRouter);
  app.use(walletBalancesRouter);
  app.use(walletAssetsRouter);
  app.use(walletSignAndSendRouter);
  app.use(chatRouter);
  app.use(chatSessionsRouter);
  app.use(errorHandlerMiddleware);

  return app;
}
