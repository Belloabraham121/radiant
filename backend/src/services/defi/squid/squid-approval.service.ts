import { isSquidEnabled } from "../../../config/squid.js";
import { isSquidSdkExecuteSupported, resolveSquidChainRef } from "../../../config/squid-chains.js";
import { AppError } from "../../../errors/app-error.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import type { ExecuteRoute } from "@0xsquid/sdk/dist/types/index.js";
import { squidSdk } from "./squid.client.js";
import {
  buildSquidExecuteSigner,
  createSquidEvmSigner,
  readOnChainExecutionTarget,
} from "./squid-execute-providers.service.js";
import type { SquidApprovalResult } from "./squid.types.js";
import type { SquidRouteSnapshot, SquidStoredRoutePayload } from "./squid.types.js";

async function resolveEvmAgentWallet(privyUserId: string) {
  const agentWallet = await resolveAgentWalletByPrivyUserId(privyUserId, "ethereum");
  if (!agentWallet) {
    throw new AppError(404, "WALLET_NOT_FOUND", "EVM agent wallet not registered.");
  }
  if (!agentWallet.signer_added) {
    throw new AppError(403, "WALLET_SIGNER_NOT_CONFIGURED", "Session signer not configured.");
  }
  return agentWallet;
}

export async function checkSquidApprovalRequired(input: {
  route: SquidRouteSnapshot;
  fromAddress: string;
  sourceEvmChainId: number;
}): Promise<{ required: boolean; message: string | null }> {
  if (!isSquidEnabled()) {
    return { required: false, message: null };
  }

  const approval = await squidSdk.isRouteApproved({
    route: input.route,
    sender: input.fromAddress,
  });
  return {
    required: !approval.isApproved,
    message: approval.message ?? null,
  };
}

export async function executeSquidApproval(
  privyUserId: string,
  input: {
    stored: SquidStoredRoutePayload;
    fromAddress: string;
  },
): Promise<SquidApprovalResult> {
  if (input.stored.from_chain_id !== "ethereum" || input.stored.from_evm_chain_id === undefined) {
    return {
      required: false,
      spender: null,
      token: null,
      tx_hash: null,
      effects_status: "skipped",
    };
  }

  const approval = await checkSquidApprovalRequired({
    route: input.stored.route,
    fromAddress: input.fromAddress,
    sourceEvmChainId: input.stored.from_evm_chain_id,
  });

  if (!approval.required) {
    return {
      required: false,
      spender: null,
      token: null,
      tx_hash: null,
      effects_status: "skipped",
    };
  }

  const agentWallet = await resolveEvmAgentWallet(privyUserId);
  const signer = createSquidEvmSigner(agentWallet, input.stored.from_evm_chain_id);

  try {
    const tx = await squidSdk.approveRoute({
      signer: signer as ExecuteRoute["signer"],
      route: input.stored.route,
      signerAddress: input.fromAddress,
    });

    const txHash = tx && typeof tx === "object" && "hash" in tx ? String(tx.hash) : null;
    return {
      required: true,
      spender: readOnChainExecutionTarget(input.stored.route),
      token: input.stored.route.params?.fromToken ?? null,
      tx_hash: txHash,
      effects_status: txHash ? "success" : "unknown",
    };
  } catch (err) {
    throw new AppError(400, "APPROVAL_FAILED", "ERC-20 approval failed before Squid cross-chain swap.", {
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}

export function assertSquidExecuteCorridorSupported(stored: SquidStoredRoutePayload): void {
  const from = resolveSquidChainRef({
    chain_id: stored.from_chain_id,
    evm_chain_id: stored.from_evm_chain_id,
  });
  const to = resolveSquidChainRef({
    chain_id: stored.to_chain_id,
    evm_chain_id: stored.to_evm_chain_id,
  });

  if (!isSquidSdkExecuteSupported(from) || !isSquidSdkExecuteSupported(to)) {
    throw new AppError(
      400,
      "SQUID_VALIDATION_ERROR",
      "Stellar Squid execute is not supported in this release. Use Soroswap for Stellar transfers.",
    );
  }
}

export async function buildSquidApprovalSigner(
  privyUserId: string,
  stored: SquidStoredRoutePayload,
) {
  if (stored.from_chain_id !== "ethereum" || stored.from_evm_chain_id === undefined) {
    throw new AppError(400, "VALIDATION_ERROR", "Squid approval is only required on EVM source chains.");
  }
  const agentWallet = await resolveEvmAgentWallet(privyUserId);
  return buildSquidExecuteSigner({
    sourceChain: { chain_id: "ethereum", evm_chain_id: stored.from_evm_chain_id },
    agentWallet,
  });
}
