import type { CorsOptions } from "cors";
import { getCorsEnv } from "./env.js";

export function createCorsOptions(): CorsOptions {
  const { corsOrigin } = getCorsEnv();
  return {
    origin: corsOrigin,
    credentials: true,
  };
}
