import type { AgentChainId } from "@/lib/agent-chains";
import { getChainMeta, type DepositRail } from "@/lib/chain-meta";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isBraveWallet?: boolean;
  isMetaMask?: boolean;
};

type SolanaInjected = {
  isPhantom?: boolean;
  isBraveWallet?: boolean;
  connect: () => Promise<{ publicKey: { toBase58: () => string } }>;
  publicKey: { toBase58: () => string } | null;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
    solana?: SolanaInjected;
  }
}

export function depositRailForChain(chainId: AgentChainId): DepositRail {
  return getChainMeta(chainId).depositRail;
}

export function isEvmInjectedAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.ethereum?.request === "function";
}

export function isSolanaInjectedAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.solana?.connect === "function";
}

/** Whether the personal-wallet deposit rail for a chain can run in this browser. */
export function isDepositRailAvailable(
  rail: DepositRail,
  options?: { suiWalletsDetected?: boolean },
): boolean {
  switch (rail) {
    case "sui-dapp-kit":
      return (options?.suiWalletsDetected ?? false) === true;
    case "evm-injected":
      return isEvmInjectedAvailable();
    case "solana-injected":
      return isSolanaInjectedAvailable();
    case "direct-only":
      return true;
    default:
      return false;
  }
}

export function injectedEvmProvider(): Eip1193Provider | null {
  if (!isEvmInjectedAvailable()) return null;
  return window.ethereum ?? null;
}

export function injectedSolanaProvider(): SolanaInjected | null {
  if (!isSolanaInjectedAvailable()) return null;
  return window.solana ?? null;
}

export async function connectInjectedEvm(): Promise<string> {
  const provider = injectedEvmProvider();
  if (!provider) {
    throw new Error("No EVM browser wallet found. Install Brave Wallet or MetaMask.");
  }

  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  const address = accounts[0];
  if (!address) {
    throw new Error("Could not read an account from your browser wallet.");
  }
  return address;
}

export async function connectInjectedSolana(): Promise<string> {
  const provider = injectedSolanaProvider();
  if (!provider) {
    throw new Error("No Solana browser wallet found. Install Phantom or use Brave.");
  }

  if (provider.publicKey) {
    return provider.publicKey.toBase58();
  }

  const result = await provider.connect();
  return result.publicKey.toBase58();
}

/** Parse a decimal ETH/SOL amount string into smallest units (wei / lamports). */
export function parseDecimalToAtomic(amount: string, decimals: number): bigint | null {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;

  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) return null;

  const paddedFraction = fraction.padEnd(decimals, "0");
  const atomic = BigInt(whole + paddedFraction);
  return atomic > 0n ? atomic : null;
}

export function atomicToHex(value: bigint): string {
  return `0x${value.toString(16)}`;
}

export async function sendInjectedEvmTransfer(input: {
  from: string;
  to: string;
  amountWei: bigint;
  chainId?: number;
}): Promise<string> {
  const provider = injectedEvmProvider();
  if (!provider) {
    throw new Error("EVM browser wallet disconnected.");
  }

  const tx: Record<string, string> = {
    from: input.from,
    to: input.to,
    value: atomicToHex(input.amountWei),
  };

  if (input.chainId !== undefined) {
    tx.chainId = atomicToHex(BigInt(input.chainId));
  }

  const hash = (await provider.request({
    method: "eth_sendTransaction",
    params: [tx],
  })) as string;

  if (!hash) {
    throw new Error("Transaction submitted but no hash returned.");
  }

  return hash;
}

function getSolanaRpcUrl(): string {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";
}

/** Build, sign, and send a SOL transfer via Phantom / Brave `window.solana`. */
export async function sendInjectedSolanaTransfer(input: {
  from: string;
  to: string;
  amountLamports: bigint;
}): Promise<string> {
  const provider = injectedSolanaProvider();
  if (!provider) {
    throw new Error("Solana browser wallet disconnected.");
  }

  const {
    Connection,
    PublicKey,
    SystemProgram,
    TransactionMessage,
    VersionedTransaction,
  } = await import("@solana/web3.js");

  const connection = new Connection(getSolanaRpcUrl(), "confirmed");
  const { blockhash } = await connection.getLatestBlockhash();

  if (lamportsToNumber(input.amountLamports) === null) {
    throw new Error("Amount is too large for a browser transfer.");
  }

  const lamports = Number(input.amountLamports);
  const fromPubkey = new PublicKey(input.from);
  const toPubkey = new PublicKey(input.to);

  const instruction = SystemProgram.transfer({
    fromPubkey,
    toPubkey,
    lamports,
  });

  const message = new TransactionMessage({
    payerKey: fromPubkey,
    recentBlockhash: blockhash,
    instructions: [instruction],
  }).compileToV0Message();

  const transaction = new VersionedTransaction(message);

  const solanaWindow = window.solana as SolanaInjected & {
    signAndSendTransaction?: (
      tx: VersionedTransaction,
    ) => Promise<{ signature: string }>;
  };

  if (typeof solanaWindow.signAndSendTransaction !== "function") {
    throw new Error("This Solana wallet does not support signAndSendTransaction.");
  }

  const result = await solanaWindow.signAndSendTransaction(transaction);
  if (!result.signature) {
    throw new Error("Transaction submitted but no signature returned.");
  }

  return result.signature;
}

function lamportsToNumber(lamports: bigint): number | null {
  if (lamports > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(lamports);
}
