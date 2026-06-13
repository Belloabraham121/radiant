/** Format a plain number with thousands separators (e.g. 10000 → "10,000"). */
export function formatDisplayNumber(
  value: number,
  options?: { maxFractionDigits?: number },
): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    maximumFractionDigits: options?.maxFractionDigits ?? 6,
  });
}

const EMBEDDED_NUMBER = /(?<![\d.])(\d+(?:\.\d+)?)(?![\d.])/g;

/**
 * Add thousands separators to numeric tokens inside human-readable amount lines
 * (e.g. "10000 SUI → ~24000.5 USDC" → "10,000 SUI → ~24,000.5 USDC").
 */
export function formatAmountDisplayText(text: string): string {
  if (!text) return text;
  return text.replace(EMBEDDED_NUMBER, (match) => {
    const num = Number(match);
    if (!Number.isFinite(num)) return match;
    const fractionLen = match.includes(".") ? (match.split(".")[1]?.length ?? 0) : 0;
    return num.toLocaleString("en-US", {
      minimumFractionDigits: fractionLen,
      maximumFractionDigits: Math.max(fractionLen, 6),
    });
  });
}
