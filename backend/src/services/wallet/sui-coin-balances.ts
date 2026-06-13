import type { SuiGrpcClient } from "@mysten/sui/grpc";
import { getSuiClient } from "../../infrastructure/sui/client.js";
import { atomicToDisplay } from "../defi/deepbook/asset-scalars.js";
import type { TokenCatalogEntry } from "../defi/deepbook/token-catalog.types.js";
import type { WalletAssetRow } from "./wallet-assets.types.js";

export type SuiBalanceClient = Pick<SuiGrpcClient, "getBalance">;

let balanceClient: SuiBalanceClient = getSuiClient();

export async function fetchSuiCoinBalances(
  owner: string,
  catalog: TokenCatalogEntry[],
): Promise<WalletAssetRow[]> {
  return Promise.all(
    catalog.map(async (entry) => {
      const { balance } = await balanceClient.getBalance({
        owner,
        coinType: entry.coin_type,
      });
      const balanceAtomic = BigInt(balance.balance);
      const balanceDisplay = atomicToDisplay(balanceAtomic, entry.decimals);

      return {
        symbol: entry.symbol,
        name: entry.name,
        coin_type: entry.coin_type,
        balance_atomic: balanceAtomic.toString(),
        balance_display: balanceDisplay,
        decimals: entry.decimals,
        usd_value: null,
        source: "sui_rpc" as const,
        popular: entry.popular,
      };
    }),
  );
}

/** Test hook — inject a mock Sui balance client. */
export function setSuiBalanceClientForTests(client: SuiBalanceClient): void {
  balanceClient = client;
}

export function resetSuiBalanceClientForTests(): void {
  balanceClient = getSuiClient();
}
