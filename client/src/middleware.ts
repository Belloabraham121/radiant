import { NextResponse, type NextRequest } from "next/server";
import {
  hasPrivyOAuthQueryParams,
  PRIVY_ACCESS_TOKEN_COOKIE,
  PRIVY_SESSION_COOKIE,
} from "@/lib/privy-session";

/** Routes that require an authenticated Privy session (SSR cookie refresh). */
const PROTECTED_PREFIXES = ["/app"];

export const config = {
  matcher: ["/app/:path*"],
};

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/refresh")) {
    return NextResponse.next();
  }

  if (hasPrivyOAuthQueryParams(req.nextUrl.searchParams)) {
    return NextResponse.next();
  }

  const accessToken = req.cookies.get(PRIVY_ACCESS_TOKEN_COOKIE)?.value;
  const session = req.cookies.get(PRIVY_SESSION_COOKIE)?.value;

  const definitelyAuthenticated = Boolean(accessToken);
  const maybeAuthenticated = Boolean(session);

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    req.nextUrl.pathname.startsWith(prefix),
  );

  if (isProtected && !definitelyAuthenticated && maybeAuthenticated) {
    const refreshUrl = req.nextUrl.clone();
    refreshUrl.pathname = "/refresh";
    refreshUrl.searchParams.set(
      "redirect_uri",
      `${req.nextUrl.pathname}${req.nextUrl.search}`,
    );
    return NextResponse.redirect(refreshUrl);
  }

  return NextResponse.next();
}
