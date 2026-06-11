import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { correlationIdMiddleware } from "./api/middleware/correlation-id.js";
import { errorHandlerMiddleware } from "./api/middleware/error-handler.js";
import { requestLoggerMiddleware } from "./api/middleware/request-logger.js";
import { healthRouter } from "./api/routes/health.js";
import { createCorsOptions } from "./config/cors.js";

/** Express app without DB connect or workers (for tests and main entry). */
export function createApp() {
  const app = express();

  app.use(cors(createCorsOptions()));
  app.use(express.json());
  app.use(cookieParser());
  app.use(correlationIdMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(healthRouter);
  app.use(errorHandlerMiddleware);

  return app;
}
