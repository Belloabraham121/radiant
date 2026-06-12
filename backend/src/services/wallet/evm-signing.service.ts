import { createViemAccount } from "@privy-io/node/viem";
import type { Hex } from "viem";
import type { LocalAccount } from "viem/accounts";
import { getPrivyClient } from "../../infrastructure/privy/client.js";
import { buildSignerAuthorizationContext } from "../../utils/privy-authorization.js";

/** Privy-backed viem account — signs via server authorization key. */
export function createPrivyViemAccount(input: {
  privyWalletId: string;
  address: string;
}): LocalAccount {
  return createViemAccount(getPrivyClient(), {
    walletId: input.privyWalletId,
    address: input.address as Hex,
    authorizationContext: buildSignerAuthorizationContext(),
  });
}
