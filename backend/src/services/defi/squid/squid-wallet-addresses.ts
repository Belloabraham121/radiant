import type { SquidChainRef } from "../../../config/squid-chains.js";
import { AppError } from "../../../errors/app-error.js";
import type { ChainId } from "../../chains/types.js";
import {
  solanaAddressSchema,
  stellarAddressSchema,
  suiAddressSchema,
} from "../../wallet/wallet.types.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";

export type SquidWalletAddressBook = Partial<
  Record<"sui" | "solana" | "ethereum" | "stellar", string>
>;

function addressesMatch(chainId: ChainId, expected: string, received: string): boolean {
  if (chainId === "ethereum") {
    return expected.toLowerCase() === received.toLowerCase();
  }
  return expected === received;
}

function resolveAddressForChainRef(
  chainRef: SquidChainRef,
  book: SquidWalletAddressBook,
  explicitAddress: string | undefined,
  role: "source" | "destination",
): string {
  const agentAddress = book[chainRef.chain_id];
  if (!agentAddress) {
    throw new AppError(
      404,
      "WALLET_NOT_FOUND",
      `Agent wallet not registered for chain ${chainRef.chain_id}.`,
    );
  }

  if (explicitAddress && !addressesMatch(chainRef.chain_id, agentAddress, explicitAddress)) {
    const field = role === "source" ? "from_address" : "to_address";
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `${field} must match the user's agent wallet.`,
      { expected: agentAddress, received: explicitAddress },
    );
  }

  return agentAddress;
}

/** Resolve Squid from/to addresses from a preloaded per-chain address book (unit-testable). */
export function resolveSquidQuoteAddressesFromBook(
  from: SquidChainRef,
  to: SquidChainRef,
  book: SquidWalletAddressBook,
  options?: { fromAddress?: string; toAddress?: string },
): { fromAddress: string; toAddress: string } {
  return {
    fromAddress: resolveAddressForChainRef(from, book, options?.fromAddress, "source"),
    toAddress: resolveAddressForChainRef(to, book, options?.toAddress, "destination"),
  };
}

/** Resolve source and destination agent wallet addresses for Squid quote/routes/execute. */
export async function resolveSquidWalletAddresses(
  privyUserId: string,
  from: SquidChainRef,
  to: SquidChainRef,
  options?: { fromAddress?: string; toAddress?: string },
): Promise<{ fromAddress: string; toAddress: string }> {
  const fromWallet = await resolveAgentWalletByPrivyUserId(privyUserId, from.chain_id);
  const toWallet = await resolveAgentWalletByPrivyUserId(privyUserId, to.chain_id);

  const book: SquidWalletAddressBook = {};
  if (fromWallet) {
    book[from.chain_id] = fromWallet.address;
  }
  if (toWallet) {
    book[to.chain_id] = toWallet.address;
  }

  const resolved = resolveSquidQuoteAddressesFromBook(from, to, book, options);
  assertBridgeWalletAddressShapes(from, to, resolved.fromAddress, resolved.toAddress);
  return resolved;
}

function isEvmWalletAddress(address: string): boolean {
  return address.length === 42 && address.slice(0, 2).toLowerCase() === "0x";
}

function isSolanaWalletAddress(address: string): boolean {
  return solanaAddressSchema.safeParse(address).success;
}

function isStellarWalletAddress(address: string): boolean {
  return stellarAddressSchema.safeParse(address).success;
}

/** Reject cross-ecosystem address mix-ups (e.g. Sui address as Base destination). */
export function assertBridgeWalletAddressShapes(
  from: SquidChainRef,
  to: SquidChainRef,
  fromAddress: string,
  toAddress: string,
): void {
  if (from.chain_id === "ethereum" && !isEvmWalletAddress(fromAddress)) {
    throw new AppError(
      400,
      "WALLET_ADDRESS_MISMATCH",
      "Source EVM network requires your Ethereum wallet address (0x…). Check wallet registration.",
    );
  }
  if (to.chain_id === "ethereum" && !isEvmWalletAddress(toAddress)) {
    throw new AppError(
      400,
      "WALLET_ADDRESS_MISMATCH",
      "Destination EVM network requires your Ethereum wallet address (0x…) to receive funds — not your Sui address.",
    );
  }
  if (from.chain_id === "sui" && !suiAddressSchema.safeParse(fromAddress).success) {
    throw new AppError(
      400,
      "WALLET_ADDRESS_MISMATCH",
      "Source Sui bridge requires your Sui wallet address.",
    );
  }
  if (to.chain_id === "sui" && !suiAddressSchema.safeParse(toAddress).success) {
    throw new AppError(
      400,
      "WALLET_ADDRESS_MISMATCH",
      "Destination Sui bridge requires your Sui wallet address to receive funds.",
    );
  }
  if (from.chain_id === "solana" && !isSolanaWalletAddress(fromAddress)) {
    throw new AppError(
      400,
      "WALLET_ADDRESS_MISMATCH",
      "Source Solana bridge requires your Solana wallet address (base58).",
    );
  }
  if (to.chain_id === "solana" && !isSolanaWalletAddress(toAddress)) {
    throw new AppError(
      400,
      "WALLET_ADDRESS_MISMATCH",
      "Destination Solana bridge requires your Solana wallet address (base58) to receive funds.",
    );
  }
  if (from.chain_id === "stellar" && !isStellarWalletAddress(fromAddress)) {
    throw new AppError(
      400,
      "WALLET_ADDRESS_MISMATCH",
      "Source Stellar bridge requires your Stellar wallet address (G…).",
    );
  }
  if (to.chain_id === "stellar" && !isStellarWalletAddress(toAddress)) {
    throw new AppError(
      400,
      "WALLET_ADDRESS_MISMATCH",
      "Destination Stellar bridge requires your Stellar wallet address (G…) to receive funds.",
    );
  }
}
