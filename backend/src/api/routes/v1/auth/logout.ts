import { Router } from "express";
import { getAuthCookieNames, getCorsEnv } from "../../../../config/env.js";
import { ok } from "../../../../utils/http-response.js";

export const authLogoutRouter = Router();

authLogoutRouter.post("/api/v1/auth/logout", (req, res) => {
  const { accessToken, identityToken, session } = getAuthCookieNames();
  const { corsOrigin } = getCorsEnv();

  const clearOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    domain: corsOrigin.includes("localhost") ? undefined : new URL(corsOrigin).hostname,
  };

  res.clearCookie(accessToken, clearOptions);
  res.clearCookie(identityToken, clearOptions);
  res.clearCookie(session, clearOptions);

  return ok(req, res, { logged_out: true });
});
