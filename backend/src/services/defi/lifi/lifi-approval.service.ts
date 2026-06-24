import type { Hex } from "viem";
import { maxUint256 } from "viem";
import { getLifiSdkClient } from "./lifi.client.js";
import { getTokenAllowance, setTokenAllowance } from "@lifi/sdk-provider-ethereum";
import { EthereumProvider } from "@lifi/sdk-provider-ethereum";
import type { Route } from "@lifi/types";
import { AppError } from "../../../errors/app-error.js";
import { createEvmWalletClient, getEvmPublicClient } from "../../../infrastructure/evm/client.js";
import { createPrivyViemAccount } from "../../wallet/evm-signing.service.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import { LIFI_NATIVE_TOKEN_ADDRESS } from "./lifi-chain-map.js";
import type { LifiApprovalResult } from "./lifi.types.js";

async function resolveAgentWallet(privyUserId: string) {
  const agentWallet = await resolveAgentWalletByPrivyUserId(privyUserId, "ethereum");
  if (!agentWallet) {
    throw new AppError(404, "WALLET_NOT_FOUND", "EVM agent wallet not registered.");
  }
  if (!agentWallet.signer_added) {
    throw new AppError(403, "WALLET_SIGNER_NOT_CONFIGURED", "Session signer not configured.");
  }
  return agentWallet;
}

function isNativeTokenAddress(address: string): boolean {
  return address.toLowerCase() === LIFI_NATIVE_TOKEN_ADDRESS.toLowerCase() || address === "native";
}

export async function checkLifiApprovalRequired(route: Route): Promise<{
  required: boolean;
  tokenAddress: string | null;
  spender: string | null;
  chainId: number | null;
  amount: bigint | null;
}> {
  const firstStep = route.steps[0];
  if (!firstStep) {
    return { required: false, tokenAddress: null, spender: null, chainId: null, amount: null };
  }

  const tokenAddress = firstStep.action.fromToken.address;
  if (isNativeTokenAddress(tokenAddress)) {
    return { required: false, tokenAddress: null, spender: null, chainId: null, amount: null };
  }

  const approvalAddress = firstStep.estimate.approvalAddress;
  if (!approvalAddress) {
    return { required: false, tokenAddress: null, spender: null, chainId: null, amount: null };
  }

  return {
    required: true,
    tokenAddress,
    spender: approvalAddress,
    chainId: firstStep.action.fromChainId,
    amount: BigInt(route.fromAmount),
  };
}

export async function executeLifiApproval(
  privyUserId: string,
  input: {
    route: Route;
    evmChainId: number;
  },
): Promise<LifiApprovalResult> {
  const approval = await checkLifiApprovalRequired(input.route);
  if (!approval.required || !approval.tokenAddress || !approval.spender || !approval.chainId) {
    return {
      required: false,
      spender: null,
      token: null,
      tx_hash: null,
      effects_status: "skipped",
    };
  }

  const agentWallet = await resolveAgentWallet(privyUserId);
  const account = createPrivyViemAccount({
    privyWalletId: agentWallet.privy_wallet_id,
    address: agentWallet.address,
  });
  const walletClient = createEvmWalletClient(approval.chainId, account);
  const publicClient = getEvmPublicClient(approval.chainId);

  const allowance = await getTokenAllowance(
    getLifiSdkClient(),
    firstStepToken(input.route),
    agentWallet.address as Hex,
    approval.spender as Hex,
  );

  if (allowance !== undefined && allowance >= (approval.amount ?? 0n)) {
    return {
      required: true,
      spender: approval.spender,
      token: approval.tokenAddress,
      tx_hash: null,
      effects_status: "skipped",
    };
  }

  try {
    const txHash = await setTokenAllowance(getLifiSdkClient(), {
      walletClient,
      token: firstStepToken(input.route),
      spenderAddress: approval.spender,
      amount: maxUint256,
    });

    let effectsStatus: LifiApprovalResult["effects_status"] = "unknown";
    if (txHash) {
      const result = await publicClient.waitForTransactionReceipt({ hash: txHash as Hex });
      effectsStatus = result.status === "success" ? "success" : "failure";
    }

    return {
      required: true,
      spender: approval.spender,
      token: approval.tokenAddress,
      tx_hash: txHash ? String(txHash) : null,
      effects_status: effectsStatus,
    };
  } catch (err) {
    throw new AppError(400, "APPROVAL_FAILED", "ERC-20 approval transaction failed.", {
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}

function firstStepToken(route: Route) {
  const step = route.steps[0];
  if (!step) {
    throw new AppError(400, "LIFI_NO_ROUTE", "Route has no steps.");
  }
  return step.action.fromToken;
}

/** Configure Li-Fi Ethereum provider with Privy wallet client for executeRoute. */
export function createLifiEthereumProvider(privyWalletId: string, address: string) {
  return EthereumProvider({
    getWalletClient: async () => {
      const account = createPrivyViemAccount({ privyWalletId, address });
      const chainId = 1;
      return createEvmWalletClient(chainId, account);
    },
    switchChain: async (chainId) => {
      const account = createPrivyViemAccount({ privyWalletId, address });
      return createEvmWalletClient(chainId, account);
    },
  });
}
