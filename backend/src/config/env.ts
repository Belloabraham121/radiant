import "dotenv/config";
import { z } from "zod";

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function getServerEnv() {
  const nodeEnv = optional("NODE_ENV", "development");
  return {
    port: Number(optional("PORT", "3001")),
    nodeEnv,
    apiDefaultVersion: optional("API_DEFAULT_VERSION", "v1"),
    logLevel: optional("LOG_LEVEL", nodeEnv === "production" ? "info" : "debug"),
  };
}

export function getCorsEnv() {
  return {
    corsOrigin: optional("CORS_ORIGIN", "http://localhost:3000"),
  };
}

const privyEnvSchema = z
  .object({
    PRIVY_APP_ID: z.string().min(1),
    PRIVY_APP_SECRET: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    CORS_ORIGIN: z.string().min(1),
    PRIVY_WEBHOOK_SIGNING_SECRET: z.string().min(1).optional(),
    NODE_ENV: z.string().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.NODE_ENV === "production" && !input.PRIVY_WEBHOOK_SIGNING_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "PRIVY_WEBHOOK_SIGNING_SECRET is required when NODE_ENV=production",
        path: ["PRIVY_WEBHOOK_SIGNING_SECRET"],
      });
    }
  });

export type PrivyEnv = z.infer<typeof privyEnvSchema>;

let cachedPrivyEnv: PrivyEnv | undefined;

/** Validated Privy + DB env — lazy so `/health` works without auth keys in tests. */
export function getPrivyEnv(): PrivyEnv {
  if (!cachedPrivyEnv) {
    cachedPrivyEnv = privyEnvSchema.parse({
      PRIVY_APP_ID: process.env.PRIVY_APP_ID,
      PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET,
      DATABASE_URL: process.env.DATABASE_URL,
      CORS_ORIGIN: process.env.CORS_ORIGIN,
      PRIVY_WEBHOOK_SIGNING_SECRET: process.env.PRIVY_WEBHOOK_SIGNING_SECRET,
      NODE_ENV: process.env.NODE_ENV,
    });
  }
  return cachedPrivyEnv;
}

export function getAuthCookieNames() {
  return {
    accessToken: "privy-token",
    identityToken: "privy-id-token",
    session: "privy-session",
  } as const;
}

/** Proxy outbound fetch — comma-separated hostnames or `.suffix` patterns. */
export function getProxyEnv() {
  const raw = optional("PROXY_SECRET_HEADER_ALLOWLIST_HOSTS", "");
  const secretHeaderAllowlistHosts = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return { secretHeaderAllowlistHosts };
}
