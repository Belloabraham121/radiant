import { Router } from "express";
import { getAuthCookieNames } from "../../../../config/env.js";
import { requireAuth } from "../../../middleware/auth.js";
import { ok } from "../../../../utils/http-response.js";

export const authLogoutRouter = Router();

function clearAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

authLogoutRouter.post("/api/v1/auth/logout", requireAuth, (req, res) => {
  const { accessToken, identityToken, session } = getAuthCookieNames();
  const clearOptions = clearAuthCookieOptions();

  res.clearCookie(accessToken, clearOptions);
  res.clearCookie(identityToken, clearOptions);
  res.clearCookie(session, clearOptions);

  return ok(req, res, { logged_out: true });
});
