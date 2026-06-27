import type { Route, RouteExtended } from "@lifi/types";
import type { Hex } from "viem";
import { AppError } from "../../../errors/app-error.js";
import { createEvmWalletClient, getEvmPublicClient } from "../../../infrastructure/evm/client.js";
import { createPrivyViemAccount } from "../../wallet/evm-signing.service.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import type { LifiChainRef } from "./lifi-chain-map.js";
import { radiantToLifiChainId } from "./lifi-chain-map.js";
import { getLifiStepTransaction } from "./lifi-step.service.js";

/** Same-chain EVM Li-Fi route (e.g. Base USDC → ETH via KyberSwap). */
export function isSameChainEvmLifiRoute(sourceChain: LifiChainRef, route: Route): boolean {
  if (sourceChain.chain_id !== "ethereum" || sourceChain.evm_chain_id === undefined) {
    return false;
  }
  if (!route.steps?.length) {
    return false;
  }
  const evmChainId = radiantToLifiChainId(sourceChain);
  return route.steps.every(
    (step) =>
      step.action.fromChainId === evmChainId && step.action.toChainId === evmChainId,
  );
}

function readBigInt(value: string | undefined | null): bigint | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function markStepDone(step: RouteExtended["steps"][number], txHash: string): void {
  step.execution = {
    status: "DONE",
    process: step.execution?.process ?? [],
    actions: [
      {
        fromChainId: step.action.fromChainId,
        toChainId: step.action.toChainId,
        fromToken: step.action.fromToken,
        toToken: step.action.toToken,
        fromAmount: step.action.fromAmount,
        toAmount: step.action.toAmount,
        txHash,
        status: "DONE",
      },
    ],
  };
}

/**
 * Execute a same-chain EVM Li-Fi route using on-chain receipts only.
 * Li-Fi's /status endpoint often 404s for same-chain DEX swaps (bridge=kyberswap, etc.).
 */
export async function executeSameChainEvmLifiRoute(
  privyUserId: string,
  route: Route,
  evmChainId: number,
): Promise<RouteExtended> {
  const agentWallet = await resolveAgentWalletByPrivyUserId(privyUserId, "ethereum");
  if (!agentWallet) {
    throw new AppError(404, "WALLET_NOT_FOUND", "EVM agent wallet not registered.");
  }
  if (!agentWallet.signer_added) {
    throw new AppError(403, "WALLET_SIGNER_NOT_CONFIGURED", "Session signer not configured.");
  }

  const account = createPrivyViemAccount({
    privyWalletId: agentWallet.privy_wallet_id,
    address: agentWallet.address,
  });
  const walletClient = createEvmWalletClient(evmChainId, account);
  const publicClient = getEvmPublicClient(evmChainId);
  const executed = structuredClone(route) as RouteExtended;

  for (let index = 0; index < executed.steps.length; index++) {
    const stepWithAddress = {
      ...executed.steps[index],
      action: {
        ...executed.steps[index].action,
        fromAddress: agentWallet.address,
        toAddress: executed.steps[index].action.toAddress ?? agentWallet.address,
      },
    };
    const step = await getLifiStepTransaction(privyUserId, stepWithAddress);
    executed.steps[index] = step;

    const tx = step.transactionRequest;
    if (!tx?.to) {
      throw new AppError(400, "LIFI_VALIDATION_ERROR", "Li-Fi route step is missing transaction data.");
    }

    const txValue = readBigInt(tx.value) ?? 0n;
    const maxFeePerGas = readBigInt(tx.maxFeePerGas);
    const feeFields =
      maxFeePerGas !== undefined
        ? {
            maxFeePerGas,
            maxPriorityFeePerGas: readBigInt(tx.maxPriorityFeePerGas),
          }
        : readBigInt(tx.gasPrice) !== undefined
          ? { gasPrice: readBigInt(tx.gasPrice) }
          : {};

    const hash = await walletClient.sendTransaction({
      account,
      chain: walletClient.chain,
      to: tx.to as Hex,
      data: (tx.data ?? "0x") as Hex,
      value: txValue,
      ...(readBigInt(tx.gasLimit) !== undefined ? { gas: readBigInt(tx.gasLimit) } : {}),
      ...feeFields,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "reverted") {
      throw new AppError(
        400,
        "TRANSACTION_FAILED",
        "The swap transaction reverted on chain. Try again with a fresh quote, or use a slightly smaller amount.",
        { tx_hash: hash, evm_chain_id: evmChainId },
      );
    }

    markStepDone(executed.steps[index], hash);
  }

  return executed;
}
