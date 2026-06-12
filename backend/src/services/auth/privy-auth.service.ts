import type { User } from "@privy-io/node";
import type { Request } from "express";
import { getAuthCookieNames } from "../../config/env.js";
import { AppError } from "../../errors/app-error.js";
import { getPrivyClient } from "../../infrastructure/privy/client.js";
import type { AuthenticatedSession } from "./auth.types.js";

export function readAccessTokenFromRequest(req: Request): string | null {
  const { accessToken } = getAuthCookieNames();
  const token = req.cookies[accessToken];
  return typeof token === "string" && token.length > 0 ? token : null;
}

function readIdentityTokenFromRequest(req: Request): string | null {
  const { identityToken } = getAuthCookieNames();
  const token = req.cookies[identityToken];
  return typeof token === "string" && token.length > 0 ? token : null;
}

export async function verifyAccessToken(accessToken: string): Promise<AuthenticatedSession> {
  try {
    const claims = await getPrivyClient().utils().auth().verifyAccessToken(accessToken);
    return {
      privyUserId: claims.user_id,
      sessionId: claims.session_id,
    };
  } catch {
    throw new AppError(401, "UNAUTHORIZED", "Invalid or expired session");
  }
}

export async function authenticateFromRequest(req: Request): Promise<AuthenticatedSession> {
  const accessToken = readAccessTokenFromRequest(req);
  if (!accessToken) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }
  return verifyAccessToken(accessToken);
}

export async function fetchPrivyUser(
  privyUserId: string,
  req: Request,
): Promise<User> {
  const identityToken = readIdentityTokenFromRequest(req);
  const privy = getPrivyClient();

  if (identityToken) {
    try {
      return await privy.users().get({ id_token: identityToken });
    } catch {
      // Fall through to server API lookup.
    }
  }

  try {
    return await privy.users()._get(privyUserId);
  } catch {
    throw new AppError(401, "UNAUTHORIZED", "Unable to load user profile");
  }
}
