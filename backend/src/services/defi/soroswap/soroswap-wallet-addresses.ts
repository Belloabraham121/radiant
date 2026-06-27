import { AppError } from "../../../errors/app-error.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import { stellarAddressSchema } from "../../wallet/wallet.types.js";

export type SoroswapWalletAddressBook = {
  stellar?: string;
};

type ResolveSoroswapWalletFn = (
  privyUserId: string,
  explicitAddress?: string,
) => Promise<string>;

let resolveSoroswapWalletAddressForTests: ResolveSoroswapWalletFn | null = null;

/** Test hook — avoid Privy/DB wallet lookup in unit tests. */
export function setResolveSoroswapWalletAddressForTests(fn: ResolveSoroswapWalletFn | null): void {
  resolveSoroswapWalletAddressForTests = fn;
}

function assertStellarWalletShape(address: string): void {
  if (!stellarAddressSchema.safeParse(address).success) {
    throw new AppError(
      400,
      "WALLET_ADDRESS_MISMATCH",
      "Stellar swap requires your Stellar wallet address (G…).",
    );
  }
}

/** Resolve Stellar agent G-address from a preloaded book (unit-testable). */
export function resolveSoroswapWalletAddressFromBook(
  book: SoroswapWalletAddressBook,
  explicitAddress?: string,
): string {
  const agentAddress = book.stellar;
  if (!agentAddress) {
    throw new AppError(
      404,
      "WALLET_NOT_FOUND",
      "Agent wallet not registered for chain stellar.",
    );
  }

  if (explicitAddress && explicitAddress !== agentAddress) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "from_address must match the user's agent wallet.",
      { expected: agentAddress, received: explicitAddress },
    );
  }

  assertStellarWalletShape(agentAddress);
  return agentAddress;
}

/** Resolve Stellar agent wallet address for Soroswap quote/build `from` param. */
export async function resolveSoroswapWalletAddress(
  privyUserId: string,
  explicitAddress?: string,
): Promise<string> {
  if (resolveSoroswapWalletAddressForTests) {
    return resolveSoroswapWalletAddressForTests(privyUserId, explicitAddress);
  }

  const wallet = await resolveAgentWalletByPrivyUserId(privyUserId, "stellar");
  return resolveSoroswapWalletAddressFromBook(
    { stellar: wallet?.address },
    explicitAddress,
  );
}
