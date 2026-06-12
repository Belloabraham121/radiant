export const SUI_COIN_TYPE = "0x2::sui::SUI";
const MIST_PER_SUI = 1_000_000_000n;

export function mistToSui(mist: bigint): number {
  return Number(mist) / Number(MIST_PER_SUI);
}
