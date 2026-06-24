/** Cookie names — keep in sync with backend `getAuthCookieNames()`. */
export const PRIVY_ACCESS_TOKEN_COOKIE = "privy-token";
export const PRIVY_IDENTITY_TOKEN_COOKIE = "privy-id-token";
export const PRIVY_SESSION_COOKIE = "privy-session";

const OAUTH_QUERY_KEYS = [
  "privy_oauth_code",
  "privy_oauth_state",
  "privy_oauth_provider",
] as const;

/** True when the request is mid OAuth return — middleware must not redirect away. */
export function hasPrivyOAuthQueryParams(
  searchParams: URLSearchParams | { get: (key: string) => string | null },
): boolean {
  return OAUTH_QUERY_KEYS.some((key) => Boolean(searchParams.get(key)));
}

/** Prevent open redirects after session refresh. */
export function sanitizeRedirectPath(
  value: string | null | undefined,
  fallback = "/app",
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  return value;
}
