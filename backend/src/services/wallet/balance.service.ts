import { getSuiClient } from "../../infrastructure/sui/client.js";

const SUI_COIN_TYPE = "0x2::sui::SUI";
const MIST_PER_SUI = 1_000_000_000n;

export function mistToSui(mist: bigint): number {
  return Number(mist) / Number(MIST_PER_SUI);
}

export async function getSuiBalanceForAddress(suiAddress: string): Promise<{
  balanceMist: bigint;
  balanceSui: number;
  funded: boolean;
  coinType: string;
}> {
  const client = getSuiClient();
  const { balance } = await client.getBalance({
    owner: suiAddress,
    coinType: SUI_COIN_TYPE,
  });
  const balanceMist = BigInt(balance.balance);
  return {
    balanceMist,
    balanceSui: mistToSui(balanceMist),
    funded: balanceMist > 0n,
    coinType: SUI_COIN_TYPE,
  };
}
