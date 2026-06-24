import helmet from "helmet";
import type { RequestHandler } from "express";

/** Helmet defaults tuned for the Radiant JSON API (CSP + HSTS in production). */
export function createSecurityHeadersMiddleware(): RequestHandler {
  const isProduction = process.env.NODE_ENV === "production";

  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
    hsts: isProduction
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: false }
      : false,
  });
}
