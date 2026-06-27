import { createRequire } from "node:module";
import { Transaction } from "@mysten/sui/transactions";
import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { SquidDataType, type OnChainExecutionData } from "@0xsquid/squid-types";
import type { ExecuteRoute } from "@0xsquid/sdk/dist/types/index.js";
import type { Hex } from "viem";
import { encodeFunctionData, erc20Abi } from "viem";
import { getEvmNetwork } from "../../../config/evm.js";
import { createEvmWalletClient, getEvmPublicClient } from "../../../infrastructure/evm/client.js";
import { getPrivyClient } from "../../../infrastructure/privy/client.js";
import { AppError } from "../../../errors/app-error.js";
import { createPrivyViemAccount } from "../../wallet/evm-signing.service.js";
import {
  parsePrivyEd25519Signature,
  signSuiTransactionBytes,
} from "../../wallet/sui-signing.service.js";
import { executeSignedSuiTransaction } from "../../wallet/sui-transaction.service.js";
import {
  isSolanaNativeTokenAddress,
  sendSolanaChainflipDeposit,
} from "../../wallet/solana-transaction.service.js";
import { buildSignerAuthorizationContext } from "../../../utils/privy-authorization.js";
import type { ResolvedAgentWallet } from "../../wallet/wallet.types.js";
import type { SquidChainRef } from "../../../config/squid-chains.js";
import { SQUID_NATIVE_EVM_TOKEN_ADDRESS } from "./squid-chain-map.js";
import type { ChainId } from "../../chains/types.js";
import { getSquidChainflipDepositAddress } from "./squid-deposit.service.js";
import { resolveSquidBridgeType } from "./squid-status.service.js";
import type { SquidChainflipDepositInfo, SquidRouteSnapshot } from "./squid.types.js";

const require = createRequire(import.meta.url);
const ethers = require("ethers") as typeof import("ethers");

type EthersTransactionRequest = import("ethers").TransactionRequest;
type EthersTransactionResponse = import("ethers").TransactionResponse;

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

function isOnChainExecutionData(
  value: SquidRouteSnapshot["transactionRequest"],
): value is OnChainExecutionData {
  return (
    value != null &&
    typeof value === "object" &&
    "type" in value &&
    value.type !== SquidDataType.ChainflipDepositAddress
  );
}

/** Privy-backed ethers v6 signer for Squid EVM executeRoute. */
export function createSquidEvmSigner(
  agentWallet: ResolvedAgentWallet,
  evmChainId: number,
): ExecuteRoute["signer"] {
  const account = createPrivyViemAccount({
    privyWalletId: agentWallet.privy_wallet_id,
    address: agentWallet.address,
  });
  const walletClient = createEvmWalletClient(evmChainId, account);
  const network = getEvmNetwork(evmChainId);
  if (!network) {
    throw new AppError(400, "EVM_CHAIN_NOT_CONFIGURED", `EVM chain ${evmChainId} is not configured`);
  }
  const provider = new ethers.JsonRpcProvider(network.rpcUrl);

  class PrivyEthersSigner extends ethers.AbstractSigner {
    constructor() {
      super(provider);
    }

    async getAddress(): Promise<string> {
      return agentWallet.address;
    }

    async signTransaction(): Promise<string> {
      throw new AppError(400, "VALIDATION_ERROR", "Raw signTransaction is not supported.");
    }

    async signMessage(): Promise<string> {
      throw new AppError(400, "VALIDATION_ERROR", "Use executeRoute for Squid message signatures.");
    }

    async signTypedData(): Promise<string> {
      throw new AppError(400, "VALIDATION_ERROR", "Typed data signing is not supported.");
    }

    async sendTransaction(
      tx: EthersTransactionRequest,
    ): Promise<EthersTransactionResponse> {
      const hash = await walletClient.sendTransaction({
        account,
        chain: walletClient.chain,
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}` | undefined,
        value: tx.value ? BigInt(tx.value.toString()) : undefined,
        gas: tx.gasLimit ? BigInt(tx.gasLimit.toString()) : undefined,
        ...(tx.maxFeePerGas
          ? {
              maxFeePerGas: BigInt(tx.maxFeePerGas.toString()),
              maxPriorityFeePerGas: tx.maxPriorityFeePerGas
                ? BigInt(tx.maxPriorityFeePerGas.toString())
                : undefined,
            }
          : tx.gasPrice
            ? { gasPrice: BigInt(tx.gasPrice.toString()) }
            : {}),
      });

      const response = await provider.getTransaction(hash);
      if (!response) {
        throw new AppError(502, "SQUID_UNAVAILABLE", "EVM transaction broadcast failed.");
      }
      return response;
    }

    connect(): import("ethers").Signer {
      return this;
    }
  }

  return new PrivyEthersSigner() as unknown as ExecuteRoute["signer"];
}

/** Manual Sui execute — wallet-standard adapter avoided for Privy async signing. */
export async function executeSquidSuiRouteManually(input: {
  route: SquidRouteSnapshot;
  agentWallet: ResolvedAgentWallet;
}): Promise<string> {
  const txRequest = input.route.transactionRequest;
  if (!isOnChainExecutionData(txRequest)) {
    throw new AppError(400, "SQUID_VALIDATION_ERROR", "Squid Sui route missing transaction data.");
  }

  const privyWallet = await fetchPrivyWalletMeta(input.agentWallet.privy_wallet_id);
  if (!privyWallet.public_key) {
    throw new AppError(403, "WALLET_SIGNER_NOT_CONFIGURED", "Sui public key missing from Privy.");
  }

  const tx = Transaction.from(txRequest.data);
  const transactionBytes = await tx.build();
  const serializedSignature = await signSuiTransactionBytes({
    privyWalletId: input.agentWallet.privy_wallet_id,
    suiAddress: input.agentWallet.address,
    publicKeyBase58: privyWallet.public_key,
    transactionBytes,
  });

  const result = await executeSignedSuiTransaction({
    transactionBytes,
    serializedSignature,
    suiAddress: input.agentWallet.address,
  });
  return result.digest;
}

/** Manual Solana execute — Squid SDK PhantomSigner path is sync-only; Privy signing is async. */
export async function executeSquidSolanaRouteManually(input: {
  route: SquidRouteSnapshot;
  agentWallet: ResolvedAgentWallet;
}): Promise<string> {
  const txRequest = input.route.transactionRequest;
  if (!isOnChainExecutionData(txRequest)) {
    throw new AppError(400, "SQUID_VALIDATION_ERROR", "Squid Solana route missing transaction data.");
  }

  const swapRequest = txRequest.data;
  if (typeof swapRequest !== "string" || !swapRequest.trim()) {
    throw new AppError(400, "SQUID_VALIDATION_ERROR", "Squid Solana route missing transaction data.");
  }

  const swapTransactionBuf = Buffer.from(swapRequest, "base64");
  const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

  const { signature } = await getPrivyClient().wallets().rawSign(input.agentWallet.privy_wallet_id, {
    authorization_context: buildSignerAuthorizationContext(),
    params: {
      bytes: Buffer.from(transaction.message.serialize()).toString("base64"),
      encoding: "base64",
      hash_function: "sha256",
    },
  });

  const rawSignature = parsePrivyEd25519Signature(signature);
  transaction.addSignature(new PublicKey(input.agentWallet.address), rawSignature);

  const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
  const txid = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: true,
    maxRetries: 2,
  });
  const latestBlockHash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({
    blockhash: latestBlockHash.blockhash,
    lastValidBlockHeight: latestBlockHash.lastValidBlockHeight + 10,
    signature: txid,
  });
  return txid;
}

export function isSquidChainflipDepositRoute(route: SquidRouteSnapshot): boolean {
  return route.transactionRequest?.type === SquidDataType.ChainflipDepositAddress;
}

function readRouteFromToken(route: SquidRouteSnapshot): string {
  const fromToken = route.params?.fromToken;
  if (typeof fromToken !== "string" || !fromToken.trim()) {
    throw new AppError(400, "SQUID_VALIDATION_ERROR", "Squid route missing source token.");
  }
  if (isSolanaNativeTokenAddress(fromToken)) {
    return fromToken;
  }
  if (fromToken.startsWith("0x") && fromToken.length === 42) {
    throw new AppError(
      400,
      "SQUID_VALIDATION_ERROR",
      "Squid Solana route returned an EVM-style token address.",
    );
  }
  return fromToken;
}

/** Solana CHAINFLIP deposit-address execute: fetch address, then Privy transfer. */
export async function executeSquidChainflipDepositRoute(input: {
  privyUserId: string;
  route: SquidRouteSnapshot;
  quoteId: string;
  agentWallet: ResolvedAgentWallet;
  toEvmChainId?: number;
}): Promise<{ txHash: string; chainflipDeposit: SquidChainflipDepositInfo }> {
  const deposit = await getSquidChainflipDepositAddress(input.privyUserId, {
    transactionRequest: input.route.transactionRequest,
    quoteId: input.quoteId,
    route: input.route,
  });

  const bridgeType = resolveSquidBridgeType(input.toEvmChainId);
  if (!bridgeType) {
    throw new AppError(
      400,
      "SQUID_VALIDATION_ERROR",
      "CHAINFLIP routes require an EVM destination chain id.",
    );
  }

  const amountAtomic = BigInt(deposit.amount);
  const transfer = await sendSolanaChainflipDeposit({
    privyWalletId: input.agentWallet.privy_wallet_id,
    from: input.agentWallet.address,
    to: deposit.depositAddress,
    amountAtomic,
    fromTokenAddress: readRouteFromToken(input.route),
  });

  return {
    txHash: transfer.hash,
    chainflipDeposit: {
      deposit_address: deposit.depositAddress,
      amount: deposit.amount,
      chainflip_status_tracking_id: deposit.chainflipStatusTrackingId,
      bridge_type: bridgeType,
    },
  };
}

export function assertSquidRouteExecutable(route: SquidRouteSnapshot, sourceChainId: ChainId): void {
  const txType = route.transactionRequest?.type;
  if (txType === SquidDataType.ChainflipDepositAddress) {
    if (sourceChainId === "solana") {
      return;
    }
    throw new AppError(
      501,
      "SQUID_VALIDATION_ERROR",
      sourceChainId === "ethereum"
        ? "Bitcoin CHAINFLIP deposit-address routes are not supported yet. Try a different corridor or provider."
        : "CHAINFLIP deposit-address routes are only supported from Solana in this release.",
    );
  }
}

export function buildSquidExecuteSigner(input: {
  sourceChain: SquidChainRef;
  agentWallet: ResolvedAgentWallet;
}): ExecuteRoute["signer"] {
  if (input.sourceChain.chain_id === "ethereum") {
    return createSquidEvmSigner(input.agentWallet, input.sourceChain.evm_chain_id);
  }
  throw new AppError(
    400,
    "VALIDATION_ERROR",
    `Use manual execute helpers for source chain ${input.sourceChain.chain_id}.`,
  );
}

export function extractSquidTxHash(
  response: unknown,
  sourceChain: SquidChainRef,
): string | null {
  if (!response || typeof response !== "object") {
    return null;
  }
  const record = response as Record<string, unknown>;

  if (typeof record.hash === "string") {
    return record.hash;
  }
  if (typeof record.tx === "string") {
    return record.tx;
  }
  if (typeof record.digest === "string") {
    return record.digest;
  }
  if (sourceChain.chain_id === "sui" && typeof record.effects === "object" && record.effects) {
    const effects = record.effects as { transactionDigest?: string };
    if (typeof effects.transactionDigest === "string") {
      return effects.transactionDigest;
    }
  }
  return null;
}

export function readOnChainExecutionTarget(
  route: SquidRouteSnapshot,
): string | null {
  const txRequest = route.transactionRequest;
  if (isOnChainExecutionData(txRequest) && typeof txRequest.target === "string") {
    return txRequest.target;
  }
  return null;
}

function readEvmRouteFromToken(route: SquidRouteSnapshot): string | null {
  const fromToken = route.params?.fromToken;
  return typeof fromToken === "string" && fromToken.startsWith("0x") ? fromToken : null;
}

function isNativeEvmSquidToken(tokenAddress: string): boolean {
  return tokenAddress.toLowerCase() === SQUID_NATIVE_EVM_TOKEN_ADDRESS.toLowerCase();
}

function readBigIntField(value: unknown): bigint | undefined {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  return undefined;
}

function readSquidRouteFromAmount(route: SquidRouteSnapshot): bigint {
  const fromAmount =
    readBigIntField(route.estimate?.fromAmount) ?? readBigIntField(route.params?.fromAmount);
  if (fromAmount === undefined) {
    throw new AppError(
      400,
      "SQUID_VALIDATION_ERROR",
      "Squid route missing from amount for ERC-20 approval.",
    );
  }
  return fromAmount;
}

function buildViemEvmSendParams(txRequest: OnChainExecutionData): {
  to: Hex;
  data?: Hex;
  value?: bigint;
  gas?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: bigint;
} {
  if (typeof txRequest.target !== "string" || !txRequest.target) {
    throw new AppError(400, "SQUID_VALIDATION_ERROR", "Squid EVM route missing target.");
  }

  const params: ReturnType<typeof buildViemEvmSendParams> = {
    to: txRequest.target as Hex,
  };

  if (typeof txRequest.data === "string" && txRequest.data.length > 0) {
    params.data = txRequest.data as Hex;
  }

  const value = readBigIntField(txRequest.value);
  if (value !== undefined) {
    params.value = value;
  }

  const gas = readBigIntField(txRequest.gasLimit);
  if (gas !== undefined) {
    params.gas = gas;
  }

  const maxFeePerGas = readBigIntField(txRequest.maxFeePerGas);
  const maxPriorityFeePerGas = readBigIntField(txRequest.maxPriorityFeePerGas);
  if (maxFeePerGas !== undefined) {
    params.maxFeePerGas = maxFeePerGas;
    if (maxPriorityFeePerGas !== undefined) {
      params.maxPriorityFeePerGas = maxPriorityFeePerGas;
    }
  } else {
    const gasPrice = readBigIntField(txRequest.gasPrice);
    if (gasPrice !== undefined) {
      params.gasPrice = gasPrice;
    }
  }

  return params;
}

/** Privy + viem ERC-20 approval — avoids Squid SDK ethers signer broadcast issues. */
export async function executeSquidEvmTokenApproval(input: {
  route: SquidRouteSnapshot;
  agentWallet: ResolvedAgentWallet;
  evmChainId: number;
  fromAddress: string;
}): Promise<{ tx_hash: string | null; effects_status: "success" | "failure" | "unknown" }> {
  const tokenAddress = readEvmRouteFromToken(input.route);
  if (!tokenAddress || isNativeEvmSquidToken(tokenAddress)) {
    return { tx_hash: null, effects_status: "unknown" };
  }

  const spender = readOnChainExecutionTarget(input.route);
  if (!spender) {
    throw new AppError(
      400,
      "SQUID_VALIDATION_ERROR",
      "Squid route missing approval spender address.",
    );
  }

  const account = createPrivyViemAccount({
    privyWalletId: input.agentWallet.privy_wallet_id,
    address: input.agentWallet.address,
  });
  const walletClient = createEvmWalletClient(input.evmChainId, account);
  const publicClient = getEvmPublicClient(input.evmChainId);

  const approvalAmount = readSquidRouteFromAmount(input.route);

  const hash = await walletClient.sendTransaction({
    account,
    chain: walletClient.chain,
    to: tokenAddress as Hex,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [spender as Hex, approvalAmount],
    }),
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return {
    tx_hash: hash,
    effects_status: receipt.status === "success" ? "success" : "failure",
  };
}

/** Privy + viem EVM execute — Squid SDK ethers signer produces invalid raw txs with Privy. */
export async function executeSquidEvmRouteManually(input: {
  route: SquidRouteSnapshot;
  agentWallet: ResolvedAgentWallet;
  evmChainId: number;
}): Promise<{ hash: string; confirmed: boolean }> {
  const txRequest = input.route.transactionRequest;
  if (!isOnChainExecutionData(txRequest)) {
    throw new AppError(400, "SQUID_VALIDATION_ERROR", "Squid EVM route missing transaction data.");
  }

  const account = createPrivyViemAccount({
    privyWalletId: input.agentWallet.privy_wallet_id,
    address: input.agentWallet.address,
  });
  const walletClient = createEvmWalletClient(input.evmChainId, account);
  const publicClient = getEvmPublicClient(input.evmChainId);
  const hash = await walletClient.sendTransaction({
    account,
    chain: walletClient.chain,
    ...buildViemEvmSendParams(txRequest),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, confirmed: receipt.status === "success" };
}

/** True when the route includes on-chain tx data (quoteOnly routes omit target/data). */
export function squidRouteHasTransactionData(route: SquidRouteSnapshot): boolean {
  const txRequest = route.transactionRequest;
  if (!txRequest || typeof txRequest !== "object") {
    return false;
  }
  if (txRequest.type === SquidDataType.ChainflipDepositAddress) {
    return true;
  }
  if (isOnChainExecutionData(txRequest)) {
    return typeof txRequest.target === "string" && txRequest.target.length > 0;
  }
  return false;
}
