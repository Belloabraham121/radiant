import { toBase64 } from "@mysten/bcs";
import { Signer, type SignatureWithBytes } from "@mysten/sui/cryptography";
import { publicKeyFromRawBytes } from "@mysten/sui/verify";
import { EthereumProvider } from "@lifi/sdk-provider-ethereum";
import { SolanaProvider } from "@lifi/sdk-provider-solana";
import { SuiProvider } from "@lifi/sdk-provider-sui";
import type { SDKProvider } from "@lifi/sdk";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { SolanaSignTransaction } from "@solana/wallet-standard-features";
import type { SolanaSignTransactionInput, SolanaSignTransactionOutput } from "@solana/wallet-standard-features";
import { getPrivyClient } from "../../../infrastructure/privy/client.js";
import { getSuiClient } from "../../../infrastructure/sui/client.js";
import { createEvmWalletClient } from "../../../infrastructure/evm/client.js";
import { AppError } from "../../../errors/app-error.js";
import { createPrivyViemAccount } from "../../wallet/evm-signing.service.js";
import {
  buildSuiSerializedSignature,
  parsePrivyEd25519PublicKey,
  parsePrivyEd25519Signature,
  signSuiTransactionBytes,
} from "../../wallet/sui-signing.service.js";
import { buildSignerAuthorizationContext } from "../../../utils/privy-authorization.js";
import type { ResolvedAgentWallet } from "../../wallet/wallet.types.js";

type PrivyWalletMeta = {
  privy_wallet_id: string;
  public_key?: string | null;
};

async function fetchPrivyWalletMeta(privyWalletId: string): Promise<PrivyWalletMeta> {
  try {
    const wallet = await getPrivyClient().wallets().get(privyWalletId);
    return {
      privy_wallet_id: privyWalletId,
      public_key: wallet.public_key ?? null,
    };
  } catch {
    throw new AppError(404, "WALLET_NOT_FOUND", "Privy wallet not found");
  }
}

class PrivySuiSigner extends Signer {
  constructor(
    private readonly meta: {
      privyWalletId: string;
      suiAddress: string;
      publicKeyBase58: string;
    },
  ) {
    super();
  }

  getKeyScheme() {
    return "ED25519" as const;
  }

  getPublicKey() {
    const rawPublicKey = parsePrivyEd25519PublicKey(this.meta.publicKeyBase58);
    return publicKeyFromRawBytes("ED25519", rawPublicKey, {
      address: this.meta.suiAddress,
    });
  }

  toSuiAddress(): string {
    return this.meta.suiAddress;
  }

  /**
   * Mysten {@link Signer.signWithIntent} hashes intent+payload then calls `sign(digest)`.
   * Privy expects the TransactionData intent message and applies blake2b256 itself
   * ({@link signSuiTransactionBytes}), so the default Signer path double-hashes and Sui rejects the sig.
   */
  async signTransaction(bytes: Uint8Array): Promise<SignatureWithBytes> {
    const signature = await signSuiTransactionBytes({
      privyWalletId: this.meta.privyWalletId,
      suiAddress: this.meta.suiAddress,
      publicKeyBase58: this.meta.publicKeyBase58,
      transactionBytes: bytes,
    });
    return {
      signature,
      bytes: toBase64(bytes),
    };
  }

  async sign(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    const { signature } = await getPrivyClient().wallets().rawSign(this.meta.privyWalletId, {
      authorization_context: buildSignerAuthorizationContext(),
      params: {
        bytes: Buffer.from(bytes).toString("hex"),
        encoding: "hex",
        hash_function: "blake2b256",
      },
    });

    return parsePrivyEd25519Signature(signature) as Uint8Array<ArrayBuffer>;
  }
}

class PrivySolanaWallet implements Wallet {
  readonly version = "1.0.0" as const;
  readonly name = "Radiant Privy Solana";
  readonly icon =
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48L3N2Zz4=" as const;

  private readonly account: WalletAccount;

  constructor(
    private readonly meta: {
      privyWalletId: string;
      address: string;
    },
  ) {
    this.account = {
      address: meta.address,
      publicKey: new Uint8Array(),
      chains: ["solana:mainnet"],
      features: [SolanaSignTransaction],
    } as WalletAccount;
  }

  get chains(): readonly ["solana:mainnet"] {
    return ["solana:mainnet"];
  }

  get accounts(): readonly WalletAccount[] {
    return [this.account];
  }

  get features(): Wallet["features"] {
    return {
      [SolanaSignTransaction]: {
        signTransaction: async (
          ...inputs: SolanaSignTransactionInput[]
        ): Promise<SolanaSignTransactionOutput[]> => {
          const outputs: SolanaSignTransactionOutput[] = [];
          for (const input of inputs) {
            const { signature } = await getPrivyClient().wallets().rawSign(this.meta.privyWalletId, {
              authorization_context: buildSignerAuthorizationContext(),
              params: {
                bytes: Buffer.from(input.transaction).toString("base64"),
                encoding: "base64",
                hash_function: "sha256",
              },
            });

            const rawSignature = parsePrivyEd25519Signature(signature);
            const signed = new Uint8Array(input.transaction.length + rawSignature.length);
            signed.set(input.transaction, 0);
            signed.set(rawSignature, input.transaction.length);
            outputs.push({ signedTransaction: signed });
          }
          return outputs;
        },
      },
    };
  }
}

export async function createLifiEthereumProvider(agentWallet: ResolvedAgentWallet) {
  return EthereumProvider({
    getWalletClient: async () => {
      const account = createPrivyViemAccount({
        privyWalletId: agentWallet.privy_wallet_id,
        address: agentWallet.address,
      });
      return createEvmWalletClient(1, account);
    },
    switchChain: async (chainId) => {
      const account = createPrivyViemAccount({
        privyWalletId: agentWallet.privy_wallet_id,
        address: agentWallet.address,
      });
      return createEvmWalletClient(chainId, account);
    },
  });
}

export async function createLifiSuiProvider(agentWallet: ResolvedAgentWallet) {
  const privyWallet = await fetchPrivyWalletMeta(agentWallet.privy_wallet_id);
  if (!privyWallet.public_key) {
    throw new AppError(
      403,
      "WALLET_SIGNER_NOT_CONFIGURED",
      "Sui public key missing from Privy wallet metadata.",
    );
  }

  const signer = new PrivySuiSigner({
    privyWalletId: agentWallet.privy_wallet_id,
    suiAddress: agentWallet.address,
    publicKeyBase58: privyWallet.public_key,
  });

  return SuiProvider({
    getClient: async () => getSuiClient(),
    getSigner: async () => signer,
  });
}

export function createLifiSolanaProvider(agentWallet: ResolvedAgentWallet) {
  return SolanaProvider({
    skipSimulation: true,
    getWallet: async () =>
      new PrivySolanaWallet({
        privyWalletId: agentWallet.privy_wallet_id,
        address: agentWallet.address,
      }),
  });
}

/** Configure Li-Fi SDK providers for all agent wallets needed by a route. */
export async function buildLifiSdkProvidersForRoute(input: {
  sourceChainId: "sui" | "solana" | "ethereum";
  routeChainIds: number[];
  agentWallets: Partial<Record<"sui" | "solana" | "ethereum", ResolvedAgentWallet>>;
}): Promise<SDKProvider[]> {
  const providers: SDKProvider[] = [];
  const needed = new Set(input.routeChainIds);

  const needsEvm = [...needed].some(
    (id) => id !== 9270000000000000 && id !== 1151111081099710,
  );
  const needsSui = needed.has(9270000000000000);
  const needsSolana = needed.has(1151111081099710);

  if (needsEvm) {
    const evmWallet = input.agentWallets.ethereum;
    if (!evmWallet) {
      throw new AppError(404, "WALLET_NOT_FOUND", "EVM agent wallet not registered.");
    }
    providers.push(await createLifiEthereumProvider(evmWallet));
  }

  if (needsSui) {
    const suiWallet = input.agentWallets.sui;
    if (!suiWallet) {
      throw new AppError(404, "WALLET_NOT_FOUND", "Sui agent wallet not registered.");
    }
    providers.push(await createLifiSuiProvider(suiWallet));
  }

  if (needsSolana) {
    const solanaWallet = input.agentWallets.solana;
    if (!solanaWallet) {
      throw new AppError(404, "WALLET_NOT_FOUND", "Solana agent wallet not registered.");
    }
    providers.push(createLifiSolanaProvider(solanaWallet));
  }

  if (providers.length === 0) {
    const fallback = input.agentWallets[input.sourceChainId];
    if (!fallback) {
      throw new AppError(404, "WALLET_NOT_FOUND", "No agent wallet for Li-Fi execute.");
    }
    if (input.sourceChainId === "ethereum") {
      providers.push(await createLifiEthereumProvider(fallback));
    } else if (input.sourceChainId === "sui") {
      providers.push(await createLifiSuiProvider(fallback));
    } else {
      providers.push(createLifiSolanaProvider(fallback));
    }
  }

  return providers;
}

export { buildSuiSerializedSignature };
