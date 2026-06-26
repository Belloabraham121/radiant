type ZodIssueLike = {
  path?: (string | number)[];
  message?: string;
  code?: string;
  type?: string;
};

const LIFI_SDK_VERSION_SUFFIX_RE = /\n?LI\.FI SDK version: [\d.]+$/i;
const LIFI_ERROR_PREFIX_RE = /^\[(?:TransactionError|SDKError|RPCError|ProviderError)\]\s*/i;

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

function sanitizeKnownToolErrorMessage(message: string): string {
  if (
    LIFI_SDK_VERSION_SUFFIX_RE.test(message) ||
    LIFI_ERROR_PREFIX_RE.test(message) ||
    /transaction failed/i.test(message)
  ) {
    return friendlyLifiTransactionMessage(message);
  }
  return message;
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
