import type { User } from "@privy-io/react-auth";
import type { AuthMeData } from "@/lib/auth-api";
import type { AgentChainId } from "@/lib/agent-chains";
import { privyChainTypeFor } from "@/lib/agent-chains";
import { getPolicyIdForChain, getSignerQuorumId } from "@/lib/privy-config";
import {
  findPrivyEmbeddedWallet,
  type PrivyEmbeddedWalletRef,
} from "@/lib/privy-wallet";
import { registerAgentWallet } from "@/lib/wallet-api";

type CreatedWalletPayload =
  | PrivyEmbeddedWalletRef
  | { wallet: { id?: string | null; address: string } }
  | { id?: string | null; address: string };

export type ChainWalletCreators = {
  sui: () => Promise<CreatedWalletPayload>;
  ethereum: () => Promise<CreatedWalletPayload>;
  solana: () => Promise<CreatedWalletPayload>;
};

function normalizeCreatedWallet(result: CreatedWalletPayload): PrivyEmbeddedWalletRef {
  if ("privyWalletId" in result) {
    return result;
  }

  const wallet = "wallet" in result ? result.wallet : result;
  if (!wallet.id) {
    throw new Error("Privy wallet is missing a server wallet ID.");
  }

  return {
    privyWalletId: wallet.id,
    address: wallet.address,
  };
}

async function resolveOrCreateWallet(
  chainId: AgentChainId,
  user: User,
  creators: ChainWalletCreators,
): Promise<PrivyEmbeddedWalletRef> {
  const existing = findPrivyEmbeddedWallet(user, chainId);
  if (existing) {
    return existing;
  }

  switch (chainId) {
    case "sui":
      return normalizeCreatedWallet(await creators.sui());
    case "ethereum":
      return normalizeCreatedWallet(await creators.ethereum());
    case "solana":
      return normalizeCreatedWallet(await creators.solana());
    default: {
      const _exhaustive: never = chainId;
      throw new Error(`Unsupported chain: ${_exhaustive}`);
    }
  }
}

export type EnsureChainWalletDeps = {
  user: User;
  me: AuthMeData;
  chainId: AgentChainId;
  creators: ChainWalletCreators;
  addSigners: (input: {
    address: string;
    signers: Array<{ signerId: string; policyIds: string[] }>;
  }) => Promise<unknown>;
};

/** Create (if needed), attach server signer, and register one agent wallet family. */
export async function ensureAgentChainWallet(deps: EnsureChainWalletDeps) {
  const quorumId = getSignerQuorumId();
  if (!quorumId) {
    throw new Error("NEXT_PUBLIC_PRIVY_SIGNER_QUORUM_ID is not configured.");
  }

  const privyChainType = privyChainTypeFor(deps.chainId);
  const wallet = await resolveOrCreateWallet(deps.chainId, deps.user, deps.creators);

  const registeredWallet =
    deps.me.agent_wallets.find((w) => w.chain_type === privyChainType) ??
    (deps.me.agent_wallet?.chain_type === privyChainType ? deps.me.agent_wallet : null);

  let hasSigner = registeredWallet?.signer_added ?? false;

  if (
    registeredWallet?.address === wallet.address &&
    registeredWallet.signer_added
  ) {
    return {
      chain_type: privyChainType,
      address: registeredWallet.address,
      funded: registeredWallet.funded,
      signer_added: true,
      ...(deps.chainId === "sui"
        ? { sui_address: registeredWallet.sui_address ?? registeredWallet.address }
        : {}),
    };
  }

  if (!hasSigner) {
    const policyId = getPolicyIdForChain(deps.chainId);
    await deps.addSigners({
      address: wallet.address,
      signers: [
        {
          signerId: quorumId,
          policyIds: policyId ? [policyId] : [],
        },
      ],
    });
    hasSigner = true;
  }

  return registerAgentWallet({
    chain_type: deps.chainId,
    privy_wallet_id: wallet.privyWalletId,
    address: wallet.address,
    signer_added: hasSigner,
  });
}
