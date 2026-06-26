const LIFI_SDK_VERSION_SUFFIX_RE = /\n?LI\.FI SDK version: [\d.]+$/i;
const LIFI_ERROR_PREFIX_RE = /^\[(?:TransactionError|SDKError|RPCError|ProviderError)\]\s*/i;

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

/** User-facing error text stored on AgentTransaction rows — no stacks or multiline dumps. */
export function sanitizeErrorMessageForUi(message: string): string {
  const firstLine = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("at "));

  let cleaned = (firstLine ?? "Transaction failed")
    .replace(/^Error:\s*/i, "")
    .trim();

  if (
    LIFI_SDK_VERSION_SUFFIX_RE.test(message) ||
    LIFI_ERROR_PREFIX_RE.test(cleaned) ||
    /transaction failed/i.test(cleaned)
  ) {
    cleaned = friendlyLifiTransactionMessage(cleaned);
  }

  return cleaned.slice(0, 500) || "Transaction failed";
}
