import { createDAppKit } from "@mysten/dapp-kit-react";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { getDefaultNetwork, GRPC_URLS, type SuiNetwork } from "@/lib/sui-config";

const defaultNetwork = getDefaultNetwork();

export const dAppKit = createDAppKit({
  networks: ["mainnet", "testnet", "devnet"] satisfies SuiNetwork[],
  defaultNetwork,
  autoConnect: false,
  createClient: (network) =>
    new SuiGrpcClient({ network, baseUrl: GRPC_URLS[network as SuiNetwork] }),
  storageKey: "radiant-dapp-kit",
});

declare module "@mysten/dapp-kit-react" {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}
