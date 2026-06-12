const WEI_PER_ETH = 1_000_000_000_000_000_000n;

/** Human-readable ETH from wei (for display only — use atomic string for precision). */
export function weiToEth(wei: bigint): number {
  const whole = wei / WEI_PER_ETH;
  const fraction = wei % WEI_PER_ETH;
  return Number(whole) + Number(fraction) / Number(WEI_PER_ETH);
}
