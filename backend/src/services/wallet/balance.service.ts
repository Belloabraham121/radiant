import { getSuiAdapterBalance } from "../chains/adapters/sui.js";

export { mistToSui } from "../../utils/sui-amount.js";

export async function getSuiBalanceForAddress(suiAddress: string): Promise<{
  balanceMist: bigint;
  balanceSui: number;
  funded: boolean;
  coinType: string;
}> {
  const balance = await getSuiAdapterBalance(suiAddress);
  return {
    balanceMist: balance.balanceMist,
    balanceSui: balance.balanceSui,
    funded: balance.funded,
    coinType: balance.coinType,
  };
}
