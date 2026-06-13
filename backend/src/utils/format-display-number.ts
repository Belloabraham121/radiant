/** Human-readable number with thousands separators for UI amount lines. */
export function fmtDisplayNumber(value: number, maxFractionDigits = 6): string {
  if (!Number.isFinite(value)) return String(value);
  return value.toLocaleString("en-US", {
    maximumFractionDigits: maxFractionDigits,
  });
}
