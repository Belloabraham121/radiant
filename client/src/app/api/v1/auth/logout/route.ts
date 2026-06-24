import { NextResponse } from "next/server";
import {
  PRIVY_ACCESS_TOKEN_COOKIE,
  PRIVY_IDENTITY_TOKEN_COOKIE,
  PRIVY_SESSION_COOKIE,
} from "@/lib/privy-session";

function clearCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}

/** Clears Privy session cookies on the Next.js origin (aligned with Privy Dashboard). */
export async function POST() {
  const response = NextResponse.json({ success: true, data: { logged_out: true } });
  const options = clearCookieOptions();

  response.cookies.set(PRIVY_ACCESS_TOKEN_COOKIE, "", options);
  response.cookies.set(PRIVY_IDENTITY_TOKEN_COOKIE, "", options);
  response.cookies.set(PRIVY_SESSION_COOKIE, "", options);

  return response;
}
