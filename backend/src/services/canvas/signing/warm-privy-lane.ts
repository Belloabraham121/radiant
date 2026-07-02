import type { LocalAccount } from "viem/accounts";
import { createPrivyViemAccount } from "../../wallet/evm-signing.service.js";

type LaneKey = string;

const accountCache = new Map<LaneKey, LocalAccount>();
const inFlight = new Map<LaneKey, Promise<LocalAccount>>();

function laneKey(userId: string, walletId: string): LaneKey {
  return `${userId}:${walletId}`;
}

export async function getWarmPrivyViemAccount(input: {
  privyUserId: string;
  privyWalletId: string;
  address: string;
}): Promise<LocalAccount> {
  const key = laneKey(input.privyUserId, input.privyWalletId);
  const cached = accountCache.get(key);
  if (cached) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = Promise.resolve(
    createPrivyViemAccount({
      privyWalletId: input.privyWalletId,
      address: input.address,
    }),
  ).then((account) => {
    accountCache.set(key, account);
    inFlight.delete(key);
    return account;
  });

  inFlight.set(key, promise);
  return promise;
}

export function clearWarmPrivyLaneForTests(): void {
  accountCache.clear();
  inFlight.clear();
}
