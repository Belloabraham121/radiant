const LAMPORTS_PER_SOL = 1_000_000_000n;

/** Human-readable SOL from lamports (for display only — use atomic string for precision). */
export function lamportsToSol(lamports: bigint): number {
  const whole = lamports / LAMPORTS_PER_SOL;
  const fraction = lamports % LAMPORTS_PER_SOL;
  return Number(whole) + Number(fraction) / Number(LAMPORTS_PER_SOL);
}
