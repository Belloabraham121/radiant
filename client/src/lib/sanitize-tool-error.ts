type ZodIssueLike = {
  path?: (string | number)[];
  message?: string;
  code?: string;
  type?: string;
};

const LIFI_SDK_VERSION_SUFFIX_RE = /\n?LI\.FI SDK version: [\d.]+$/i;
const LIFI_ERROR_PREFIX_RE = /^\[(?:TransactionError|SDKError|RPCError|ProviderError)\]\s*/i;
const SQUID_SDK_NOISE_RE =
  /(?:@0xsquid\/sdk|SquidRouter|squid\.xyz|integratorId|routeStatus)/i;
const SQUID_NO_ROUTE_RE = /SQUID_NO_ROUTE|no alternate route/i;
const SOROSWAP_API_NOISE_RE =
  /(?:soroswap\.(?:app|xyz|api)|api\.soroswap|integratorId|routeStatus)/i;
const SOROSWAP_ERROR_CODE_RE =
  /SOROSWAP_(?:ROUTE_NOT_FOUND|VALIDATION_ERROR|UNAUTHORIZED|RATE_LIMITED|UNAVAILABLE|QUOTE_EXPIRED)/;
const SOROSWAP_API_KEY_RE = /sk_[a-zA-Z0-9_-]+/g;
const SOROSWAP_API_KEY_DETECT_RE = /sk_[a-zA-Z0-9_-]+/;
const STELLAR_TRUSTLINE_RE = /trustline|op_no_trust|missing trustline/i;
const STELLAR_RESERVE_RE =
  /(?:minimum reserve|base reserve|op_no_account|fund your stellar wallet|underfunded)/i;

function pathLabel(path: (string | number)[]): string {
  return path.length === 0 ? "input" : path.join(".");
}

function issueToMessage(issue: ZodIssueLike): string {
  const field = pathLabel(issue.path ?? []);
  if (issue.code === "too_small" && issue.type === "number") {
    return `${field} must be a positive number`;
  }
  return issue.message ? `${field}: ${issue.message}` : `${field} is invalid`;
}

function stripLifiSdkNoise(message: string): string {
  return message.replace(LIFI_SDK_VERSION_SUFFIX_RE, "").replace(LIFI_ERROR_PREFIX_RE, "").trim();
}

function friendlyLifiTransactionMessage(message: string): string {
  const cleaned = stripLifiSdkNoise(message);
  if (!cleaned || cleaned === "[object Object]") {
    return "The bridge transaction failed. Check your wallet balance and try again.";
  }
  if (/^transaction failed:/i.test(cleaned)) {
    const detail = cleaned.replace(/^transaction failed:\s*/i, "").trim();
    if (!detail || detail === "[object Object]") {
      return "The bridge transaction failed on chain. Check your wallet balance and try again.";
    }
    return `The bridge transaction failed: ${detail}`;
  }
  if (/\[object Object\]/.test(cleaned)) {
    return "The bridge transaction failed. Check your wallet balance and try again.";
  }
  return cleaned;
}

function stripSquidSdkNoise(message: string): string {
  return message
    .replace(/\[object Object\]/g, "")
    .replace(/\{[^}]*integratorId[^}]*\}/gi, "")
    .replace(/@0xsquid\/sdk/gi, "")
    .replace(/SquidRouter/gi, "")
    .replace(/squid\.xyz/gi, "")
    .replace(/integratorId\s*\w*/gi, "")
    .replace(/routeStatus/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^\[\]\s*/, "")
    .trim();
}

function friendlySquidNoRouteMessage(message: string): string {
  if (SQUID_NO_ROUTE_RE.test(message)) {
    return "No alternate route is available for this transfer right now. Try a different amount or pair.";
  }
  return message;
}

function stripSoroswapApiNoise(message: string): string {
  return message
    .replace(SOROSWAP_API_KEY_RE, "[redacted]")
    .replace(/Authorization[^\s]*/gi, "[redacted]")
    .replace(/Bearer\s+[^\s]+/gi, "[redacted]")
    .replace(/@?soroswap[^\s]*/gi, "")
    .replace(/integratorId\s*\w*/gi, "")
    .replace(/routeStatus/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function friendlySoroswapErrorMessage(message: string): string {
  if (/SOROSWAP_ROUTE_NOT_FOUND/i.test(message)) {
    return "No swap route on Stellar right now. Try a different amount, slippage, or token pair.";
  }
  if (/SOROSWAP_QUOTE_EXPIRED/i.test(message)) {
    return "This Stellar quote expired. Get a fresh quote, then approve again.";
  }
  if (/SOROSWAP_RATE_LIMITED/i.test(message)) {
    return "Stellar quotes are temporarily rate limited. Wait a few seconds and try again.";
  }
  if (/SOROSWAP_UNAUTHORIZED/i.test(message)) {
    return "Stellar swap service is misconfigured. Try again later.";
  }
  if (/SOROSWAP_VALIDATION_ERROR/i.test(message)) {
    return "Invalid Stellar swap request. Check the token pair, amount, and slippage.";
  }
  if (/SOROSWAP_UNAVAILABLE/i.test(message)) {
    return "Stellar swap service is temporarily unavailable. Try again shortly.";
  }
  return message;
}

function friendlyStellarBalanceMessage(message: string): string {
  if (STELLAR_TRUSTLINE_RE.test(message)) {
    return "Missing trustline for this asset. Open a trustline first or use a gasless trustline flow when available.";
  }
  if (STELLAR_RESERVE_RE.test(message)) {
    return "Fund your Stellar wallet with XLM first (minimum reserve applies).";
  }
  return message;
}

function parseToolErrorJson(message: string): string | null {
  if (!message.startsWith("{")) {
    return null;
  }
  try {
    const parsed = JSON.parse(message) as {
      code?: string;
      message?: string;
    };
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      const codePrefix =
        typeof parsed.code === "string" && parsed.code.trim()
          ? `${parsed.code}: ${parsed.message}`
          : parsed.message;
      return sanitizeKnownToolErrorMessage(codePrefix);
    }
  } catch {
    return null;
  }
  return null;
}

function sanitizeKnownToolErrorMessage(message: string): string {
  let next = message;
  if (SOROSWAP_API_KEY_DETECT_RE.test(next) || /Authorization|Bearer\s+/i.test(next)) {
    next = stripSoroswapApiNoise(next);
  }

  const fromJson = parseToolErrorJson(next);
  if (fromJson) {
    return fromJson;
  }

  if (STELLAR_TRUSTLINE_RE.test(next) || STELLAR_RESERVE_RE.test(next)) {
    return friendlyStellarBalanceMessage(next);
  }

  if (SOROSWAP_ERROR_CODE_RE.test(next)) {
    return friendlySoroswapErrorMessage(next);
  }

  if (SQUID_NO_ROUTE_RE.test(next)) {
    return friendlySquidNoRouteMessage(next);
  }
  if (SQUID_SDK_NOISE_RE.test(next)) {
    const cleaned = stripSquidSdkNoise(next);
    return cleaned || "The alternate route request failed. Try again in a moment.";
  }
  if (SOROSWAP_API_NOISE_RE.test(next) || /soroswap/i.test(next)) {
    const cleaned = stripSoroswapApiNoise(next);
    return cleaned || "The Stellar swap request failed. Try again in a moment.";
  }
  if (
    LIFI_SDK_VERSION_SUFFIX_RE.test(next) ||
    LIFI_ERROR_PREFIX_RE.test(next) ||
    /transaction failed/i.test(next)
  ) {
    return friendlyLifiTransactionMessage(next);
  }
  return next;
}

/** Format Zod JSON error blobs for execution timeline and receipts. */
export function sanitizeToolErrorMessage(message: string | undefined): string {
  if (!message) {
    return "Request failed";
  }

  const trimmed = message.trim();
  if (!trimmed.startsWith("[")) {
    return sanitizeKnownToolErrorMessage(trimmed);
  }

  try {
    const parsed = JSON.parse(trimmed) as ZodIssueLike[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return sanitizeKnownToolErrorMessage(trimmed);
    }
    return parsed.map(issueToMessage).join("; ");
  } catch {
    return sanitizeKnownToolErrorMessage(trimmed);
  }
}
