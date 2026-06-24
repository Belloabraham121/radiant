import dns from "node:dns/promises";
import { AppError } from "../../errors/app-error.js";
import { getProxyEnv } from "../../config/env.js";

export const MAX_OUTBOUND_REDIRECTS = 5;
const DNS_CACHE_TTL_MS = 60_000;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "::1",
  "metadata.google.internal",
  "169.254.169.254",
]);

/** Headers always removed from outbound proxy/agent requests. */
export const INFRA_STRIPPED_REQUEST_HEADERS = new Set([
  "host",
  "cookie",
  "x-forwarded-for",
  "x-real-ip",
  "connection",
  "transfer-encoding",
]);

/** Credential headers stripped unless the target host is allowlisted. */
export const SENSITIVE_FORWARD_HEADERS = new Set([
  "authorization",
  "cookie",
  "x-api-key",
  "proxy-authorization",
]);

export type SsrfErrorCodes = {
  invalidUrl: string;
  invalidProtocol: string;
  blockedHost: string;
  redirectError: string;
  tooManyRedirects: string;
};

export const PROXY_SSRF_ERROR_CODES: SsrfErrorCodes = {
  invalidUrl: "PROXY_INVALID_URL",
  invalidProtocol: "PROXY_INVALID_PROTOCOL",
  blockedHost: "PROXY_BLOCKED_HOST",
  redirectError: "PROXY_REDIRECT_ERROR",
  tooManyRedirects: "PROXY_TOO_MANY_REDIRECTS",
};

export const CALL_API_SSRF_ERROR_CODES: SsrfErrorCodes = {
  invalidUrl: "INVALID_URL",
  invalidProtocol: "INVALID_PROTOCOL",
  blockedHost: "BLOCKED_URL",
  redirectError: "REDIRECT_ERROR",
  tooManyRedirects: "TOO_MANY_REDIRECTS",
};

export function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

export function isPrivateOrLocalHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);

  if (BLOCKED_HOSTNAMES.has(normalized) || BLOCKED_HOSTNAMES.has(hostname)) {
    return true;
  }

  if (normalized.endsWith(".internal")) {
    return true;
  }

  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.)/.test(normalized)) {
    return true;
  }

  if (normalized.includes(":")) {
    if (normalized === "::" || normalized.startsWith("fe80:")) {
      return true;
    }
    if (/^f[cd][0-9a-f]{2}:/i.test(normalized)) {
      return true;
    }
    if (normalized.startsWith("::ffff:")) {
      const mapped = normalized.slice("::ffff:".length);
      if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.)/.test(mapped)) {
        return true;
      }
    }
  }

  return false;
}

type DnsCacheEntry = {
  ips: string[];
  expiresAt: number;
};

const dnsCache = new Map<string, DnsCacheEntry>();

function isIpLiteral(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return (
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized) ||
    normalized.includes(":")
  );
}

/** Resolve hostname and reject answers in private/local ranges (mitigates DNS rebinding). */
export async function resolveAndValidateHostname(
  hostname: string,
  codes: SsrfErrorCodes = PROXY_SSRF_ERROR_CODES,
): Promise<string[]> {
  const normalized = normalizeHostname(hostname);

  if (isIpLiteral(normalized)) {
    if (isPrivateOrLocalHostname(normalized)) {
      throw new AppError(
        403,
        codes.blockedHost,
        `Requests to ${hostname} are not allowed.`,
      );
    }
    return [normalized];
  }

  const cached = dnsCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ips;
  }

  let results: Array<{ address: string }>;
  try {
    results = await dns.lookup(normalized, { all: true, verbatim: true });
  } catch {
    throw new AppError(
      403,
      codes.blockedHost,
      `Could not resolve hostname ${hostname}.`,
    );
  }

  const ips = results.map((entry) => entry.address);
  for (const ip of ips) {
    if (isPrivateOrLocalHostname(ip)) {
      throw new AppError(
        403,
        codes.blockedHost,
        `Requests to ${hostname} are not allowed.`,
      );
    }
  }

  dnsCache.set(normalized, {
    ips,
    expiresAt: Date.now() + DNS_CACHE_TTL_MS,
  });

  return ips;
}

export function clearDnsCacheForTests(): void {
  dnsCache.clear();
}

function matchesAllowlistEntry(hostname: string, entry: string): boolean {
  const normalized = normalizeHostname(hostname);
  const pattern = entry.toLowerCase();
  if (pattern.startsWith(".")) {
    return normalized.endsWith(pattern) || normalized === pattern.slice(1);
  }
  return normalized === pattern;
}

export function isHostAllowlistedForSecretHeaders(hostname: string): boolean {
  const { secretHeaderAllowlistHosts } = getProxyEnv();
  return secretHeaderAllowlistHosts.some((entry) =>
    matchesAllowlistEntry(hostname, entry),
  );
}

export function validateOutboundUrl(
  raw: string,
  codes: SsrfErrorCodes = PROXY_SSRF_ERROR_CODES,
): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AppError(400, codes.invalidUrl, `Invalid URL: ${raw}`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new AppError(
      400,
      codes.invalidProtocol,
      `Only http and https URLs are allowed. Got: ${parsed.protocol}`,
    );
  }

  if (isPrivateOrLocalHostname(parsed.hostname)) {
    throw new AppError(
      403,
      codes.blockedHost,
      `Requests to ${parsed.hostname} are not allowed.`,
    );
  }

  return parsed;
}

export function sanitizeOutboundRequestHeaders(
  headers: Record<string, string> | undefined,
  targetHostname: string,
): Record<string, string> {
  const allowSecrets = isHostAllowlistedForSecretHeaders(targetHostname);
  const sanitized: Record<string, string> = {};

  if (!headers) {
    return sanitized;
  }

  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (INFRA_STRIPPED_REQUEST_HEADERS.has(lower)) {
      continue;
    }
    if (!allowSecrets && SENSITIVE_FORWARD_HEADERS.has(lower)) {
      continue;
    }
    sanitized[key] = value;
  }

  return sanitized;
}

/**
 * Manual redirect handling with SSRF validation on every hop.
 * Hostname is resolved before fetch; private answers are blocked (short TTL cache).
 */
export async function fetchWithSsrfGuard(
  url: URL,
  init: RequestInit,
  options?: {
    maxRedirects?: number;
    codes?: SsrfErrorCodes;
  },
): Promise<Response> {
  const codes = options?.codes ?? PROXY_SSRF_ERROR_CODES;
  const maxRedirects = options?.maxRedirects ?? MAX_OUTBOUND_REDIRECTS;
  let currentUrl = url;
  let redirectCount = 0;

  while (true) {
    await resolveAndValidateHostname(currentUrl.hostname, codes);

    const res = await fetch(currentUrl.toString(), {
      ...init,
      redirect: "manual",
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new AppError(
          502,
          codes.redirectError,
          `Redirect response from ${currentUrl.hostname} missing Location header.`,
        );
      }

      redirectCount += 1;
      if (redirectCount > maxRedirects) {
        throw new AppError(
          502,
          codes.tooManyRedirects,
          `Too many redirects while fetching ${url.hostname}.`,
        );
      }

      currentUrl = validateOutboundUrl(
        new URL(location, currentUrl).toString(),
        codes,
      );
      continue;
    }

    return res;
  }
}
