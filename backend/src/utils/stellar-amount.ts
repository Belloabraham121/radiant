const STROOPS_PER_XLM = 10_000_000n;

/** Human-readable XLM from stroops (for display only — use atomic string for precision). */
export function stroopsToXlm(stroops: bigint): number {
  const whole = stroops / STROOPS_PER_XLM;
  const fraction = stroops % STROOPS_PER_XLM;
  return Number(whole) + Number(fraction) / Number(STROOPS_PER_XLM);
}

/** Stellar payment `amount` field (up to 7 decimal places). */
export function stroopsToAmountString(stroops: bigint): string {
  if (stroops <= 0n) {
    throw new Error("stroops must be positive");
  }
  const whole = stroops / STROOPS_PER_XLM;
  const fraction = stroops % STROOPS_PER_XLM;
  if (fraction === 0n) {
    return whole.toString();
  }
  const fracStr = fraction.toString().padStart(7, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

/** Parse Horizon native balance string to stroops. */
export function xlmBalanceStringToStroops(balance: string): bigint {
  const [wholePart, fracPart = ""] = balance.split(".");
  const whole = wholePart.length > 0 ? BigInt(wholePart) : 0n;
  const fracPadded = (fracPart + "0000000").slice(0, 7);
  const fraction = fracPadded.length > 0 ? BigInt(fracPadded) : 0n;
  return whole * STROOPS_PER_XLM + fraction;
}
