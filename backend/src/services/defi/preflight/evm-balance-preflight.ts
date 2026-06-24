import type { Route } from "@lifi/types";
import { AppError } from "../../../errors/app-error.js";
import { getEvmNetwork, resolveEvmChainId } from "../../../config/evm.js";
import { getEvmPublicClient } from "../../../infrastructure/evm/client.js";
import { weiToEth } from "../../../utils/evm-amount.js";
import type { ChainId } from "../../chains/types.js";
import {
  formatUsd,
  resolveSymbolUsdPrices,
} from "../../market/valuation.service.js";
import {
  LIFI_NATIVE_TOKEN_ADDRESS,
  formatAtomicAmount,
} from "../lifi/lifi-chain-map.js";
import { isExecutableLifiRoute } from "../lifi/lifi-normalize.js";
import { resolveSourceChainFromExecuteInput } from "../lifi/lifi-quote.service.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import { fetchEvmPrivyWalletAssets } from "../../wallet/privy-balance.service.js";
import type { WalletAssetRow } from "../../wallet/wallet-assets.types.js";

/** Minimum native gas buffer when Li-Fi route omits gasCosts (wei). */
export const MIN_EVM_GAS_WEI = 500_000_000_000_000n;

export type EvmSpendRequirement = {
  evm_chain_id: number;
  network_label: string;
  gas_wei: bigint;
  spend_token_symbol?: string;
  spend_amount_atomic?: bigint;
  spend_token_decimals?: number;
  spend_is_native?: boolean;
};

type NativeBalanceFn = (
  address: string,
  evmChainId: number,
) => Promise<{ balance_atomic: string }>;

type TokenAssetsFn = (
  privyWalletId: string,
  options: { evmChainId: number; includeUsd: boolean },
) => Promise<{ assets: WalletAssetRow[] }>;

type ResolveWalletFn = (
  privyUserId: string,
) => Promise<{ address: string; privy_wallet_id: string } | null>;

let fetchNativeBalance: NativeBalanceFn = async (address, evmChainId) => {
  const chainId = resolveEvmChainId(evmChainId);
  const client = getEvmPublicClient(chainId);
  const balanceWei = await client.getBalance({ address: address as `0x${string}` });
  return { balance_atomic: balanceWei.toString() };
};

let fetchTokenAssets: TokenAssetsFn = async (privyWalletId, options) =>
  fetchEvmPrivyWalletAssets(privyWalletId, options);

let resolveWallet: ResolveWalletFn = async (privyUserId) =>
  resolveAgentWalletByPrivyUserId(privyUserId, "ethereum");

function readBigIntParam(value: unknown): bigint | undefined {
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return BigInt(value);
  }
  return undefined;
}

function readStringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isNativeTokenAddress(address: string): boolean {
  return (
    address.toLowerCase() === LIFI_NATIVE_TOKEN_ADDRESS.toLowerCase() || address === "native"
  );
}

function isNativeSpendSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  return upper === "ETH" || upper === "POL";
}

function formatWeiDisplay(wei: bigint): string {
  if (wei === 0n) {
    return "0";
  }

  const eth = weiToEth(wei);
  if (eth >= 0.0001) {
    return eth.toFixed(4).replace(/\.?0+$/, "");
  }

  const decimals = Math.min(18, Math.max(6, Math.ceil(-Math.log10(eth)) + 2));
  return eth.toFixed(decimals).replace(/\.?0+$/, "");
}

function formatEthAmount(wei: bigint, priceMap?: Map<string, { usdPrice: number | null }>): string {
  const amountDisplay = weiToEth(wei);
  const usdSuffix = formatUsdSuffix("ETH", amountDisplay, priceMap);
  return `${formatWeiDisplay(wei)} ETH${usdSuffix}`;
}

function formatUsdSuffix(
  symbol: string,
  amountDisplay: number,
  priceMap?: Map<string, { usdPrice: number | null }>,
): string {
  if (!priceMap || !Number.isFinite(amountDisplay)) {
    return "";
  }
  const usdPrice = priceMap.get(symbol.toUpperCase())?.usdPrice;
  if (usdPrice === null || usdPrice === undefined) {
    return "";
  }
  const formatted = formatUsd(amountDisplay * usdPrice, { prefix: "~$" });
  return formatted ? ` (${formatted})` : "";
}

function formatTokenBalanceDisplay(
  balanceAtomic: bigint,
  symbol: string,
  decimals: number | undefined,
  priceMap?: Map<string, { usdPrice: number | null }>,
): string {
  if (balanceAtomic === 0n) {
    return `0 ${symbol}${formatUsdSuffix(symbol, 0, priceMap)}`;
  }

  let amountDisplay: number;
  if (decimals !== undefined) {
    try {
      const display = formatAtomicAmount(balanceAtomic.toString(), decimals);
      amountDisplay = Number(display);
      return `${display} ${symbol}${formatUsdSuffix(symbol, amountDisplay, priceMap)}`;
    } catch {
      // Fall through to atomic display.
    }
  }

  amountDisplay = Number(balanceAtomic);
  return `${balanceAtomic.toString()} ${symbol}${formatUsdSuffix(symbol, amountDisplay, priceMap)}`;
}

function formatSpendAmountDisplay(
  requirement: EvmSpendRequirement,
  priceMap?: Map<string, { usdPrice: number | null }>,
): string {
  if (requirement.spend_amount_atomic === undefined || !requirement.spend_token_symbol) {
    return "";
  }

  const base = formatSpendAmount(requirement);
  if (requirement.spend_token_decimals !== undefined) {
    try {
      const display = formatAtomicAmount(
        requirement.spend_amount_atomic.toString(),
        requirement.spend_token_decimals,
      );
      const usdSuffix = formatUsdSuffix(
        requirement.spend_token_symbol,
        Number(display),
        priceMap,
      );
      return `${display} ${requirement.spend_token_symbol}${usdSuffix}`;
    } catch {
      // Fall through to base formatting.
    }
  }

  const usdSuffix = formatUsdSuffix(
    requirement.spend_token_symbol,
    Number(requirement.spend_amount_atomic),
    priceMap,
  );
  return `${base}${usdSuffix}`;
}

function sumGasWeiFromRoute(route: Route, sourceChainId: number): bigint {
  let total = 0n;
  for (const step of route.steps) {
    if (step.action.fromChainId !== sourceChainId) {
      continue;
    }
    for (const cost of step.estimate?.gasCosts ?? []) {
      try {
        total += BigInt(cost.amount);
      } catch {
        // Skip malformed gas cost entries.
      }
    }
  }
  return total > 0n ? total : MIN_EVM_GAS_WEI;
}

function resolveRouteFromParams(params: Record<string, unknown>): Route | null {
  const embedded = params.lifi_route ?? params.route;
  return isExecutableLifiRoute(embedded) ? embedded : null;
}

/** Build EVM spend + gas requirement from Li-Fi execute params and optional route. */
export function buildLifiSpendRequirement(input: {
  action: string;
  params: Record<string, unknown>;
  route?: Route | null;
}): EvmSpendRequirement | null {
  const route = input.route ?? resolveRouteFromParams(input.params);

  const sourceChain = resolveSourceChainFromExecuteInput({
    from_chain_id: readStringParam(input.params.from_chain_id) as ChainId | undefined,
    from_evm_chain_id:
      typeof input.params.from_evm_chain_id === "number"
        ? input.params.from_evm_chain_id
        : undefined,
    route: route ?? undefined,
  });

  if (sourceChain.chain_id !== "ethereum" || sourceChain.evm_chain_id === undefined) {
    return null;
  }

  const evmChainId = sourceChain.evm_chain_id;
  const networkLabel = getEvmNetwork(evmChainId)?.name ?? `EVM ${evmChainId}`;
  const gasWei = route ? sumGasWeiFromRoute(route, evmChainId) : MIN_EVM_GAS_WEI;

  if (input.action === "lifi_approve") {
    return {
      evm_chain_id: evmChainId,
      network_label: networkLabel,
      gas_wei: gasWei,
    };
  }

  if (route) {
    const firstStep = route.steps[0];
    if (!firstStep) {
      return {
        evm_chain_id: evmChainId,
        network_label: networkLabel,
        gas_wei: gasWei,
      };
    }

    const spendSymbol = firstStep.action.fromToken.symbol;
    let spendAmount: bigint;
    try {
      spendAmount = BigInt(route.fromAmount);
    } catch {
      return {
        evm_chain_id: evmChainId,
        network_label: networkLabel,
        gas_wei: gasWei,
      };
    }

    return {
      evm_chain_id: evmChainId,
      network_label: networkLabel,
      gas_wei: gasWei,
      spend_token_symbol: spendSymbol,
      spend_amount_atomic: spendAmount,
      spend_token_decimals: firstStep.action.fromToken.decimals,
      spend_is_native: isNativeTokenAddress(firstStep.action.fromToken.address),
    };
  }

  const spendSymbol =
    readStringParam(input.params.from_token_symbol) ?? readStringParam(input.params.from_token);
  const spendAmount = readBigIntParam(input.params.from_amount_atomic);
  const spendDecimals =
    typeof input.params.from_token_decimals === "number"
      ? input.params.from_token_decimals
      : undefined;

  if (!spendSymbol || spendAmount === undefined) {
    return {
      evm_chain_id: evmChainId,
      network_label: networkLabel,
      gas_wei: gasWei,
    };
  }

  return {
    evm_chain_id: evmChainId,
    network_label: networkLabel,
    gas_wei: gasWei,
    spend_token_symbol: spendSymbol,
    spend_amount_atomic: spendAmount,
    spend_token_decimals: spendDecimals,
    spend_is_native: isNativeSpendSymbol(spendSymbol),
  };
}

function findTokenBalanceAtomic(
  assets: WalletAssetRow[],
  symbol: string,
): bigint {
  const normalized = symbol.toUpperCase();
  const row = assets.find((asset) => asset.symbol.toUpperCase() === normalized);
  if (!row) {
    return 0n;
  }
  try {
    return BigInt(row.balance_atomic);
  } catch {
    return 0n;
  }
}

function formatSpendAmount(requirement: EvmSpendRequirement): string {
  if (requirement.spend_amount_atomic === undefined || !requirement.spend_token_symbol) {
    return "";
  }
  if (requirement.spend_token_decimals !== undefined) {
    try {
      return `${formatAtomicAmount(
        requirement.spend_amount_atomic.toString(),
        requirement.spend_token_decimals,
      )} ${requirement.spend_token_symbol}`;
    } catch {
      // Fall through to atomic display.
    }
  }
  return `${requirement.spend_amount_atomic.toString()} ${requirement.spend_token_symbol}`;
}

async function buildInsufficientBalanceMessage(
  requirement: EvmSpendRequirement,
  nativeWei: bigint,
  tokenBalanceWei: bigint | null,
): Promise<string> {
  const network = requirement.network_label;
  const symbols = ["ETH"];
  if (requirement.spend_token_symbol) {
    symbols.push(requirement.spend_token_symbol);
  }
  const priceMap = await resolveSymbolUsdPrices(symbols);

  const gasDisplay = formatEthAmount(requirement.gas_wei, priceMap);
  const nativeDisplay = formatEthAmount(nativeWei, priceMap);

  if (!requirement.spend_token_symbol || requirement.spend_amount_atomic === undefined) {
    return (
      `Unable to complete this transaction — your agent wallet on ${network} has ${nativeDisplay}, ` +
      `but you need about ${gasDisplay} for network gas. Add ETH on ${network} and try again.`
    );
  }

  const spendDisplay = formatSpendAmountDisplay(requirement, priceMap);

  if (requirement.spend_is_native) {
    const totalNeeded = requirement.spend_amount_atomic + requirement.gas_wei;
    return (
      `Unable to complete this bridge — your agent wallet on ${network} has ${nativeDisplay}, ` +
      `but you need about ${formatEthAmount(totalNeeded, priceMap)} (${spendDisplay} plus ~${gasDisplay} for gas). ` +
      `Add ETH on ${network} and try again.`
    );
  }

  const tokenDisplay =
    tokenBalanceWei !== null && requirement.spend_token_symbol
      ? formatTokenBalanceDisplay(
          tokenBalanceWei,
          requirement.spend_token_symbol,
          requirement.spend_token_decimals,
          priceMap,
        )
      : `0 ${requirement.spend_token_symbol ?? "token"}`;

  return (
    `Unable to complete this bridge — your agent wallet on ${network} does not have enough funds. ` +
    `You need ${spendDisplay} and about ${gasDisplay} for gas ` +
    `(you have ${tokenDisplay} and ${nativeDisplay} on ${network}). ` +
    `Add the source token and ETH on ${network} and try again.`
  );
}

/** Throws INSUFFICIENT_BALANCE when the EVM wallet cannot cover gas and optional token spend. */
export async function assertEvmWalletFundedForSpend(
  privyUserId: string,
  requirement: EvmSpendRequirement,
): Promise<void> {
  const wallet = await resolveWallet(privyUserId);
  if (!wallet) {
    throw new AppError(404, "WALLET_NOT_FOUND", "EVM agent wallet not registered.");
  }

  const nativeResult = await fetchNativeBalance(wallet.address, requirement.evm_chain_id);
  let nativeWei = 0n;
  try {
    nativeWei = BigInt(nativeResult.balance_atomic);
  } catch {
    nativeWei = 0n;
  }

  if (requirement.spend_is_native && requirement.spend_amount_atomic !== undefined) {
    const totalNativeNeeded = requirement.spend_amount_atomic + requirement.gas_wei;
    if (nativeWei < totalNativeNeeded) {
      throw new AppError(
        400,
        "INSUFFICIENT_BALANCE",
        await buildInsufficientBalanceMessage(requirement, nativeWei, null),
        {
          evm_chain_id: requirement.evm_chain_id,
          network: requirement.network_label,
          native_wei: nativeWei.toString(),
          required_native_wei: totalNativeNeeded.toString(),
          required_gas_wei: requirement.gas_wei.toString(),
        },
      );
    }
    return;
  }

  let tokenBalanceWei: bigint | null = null;
  if (
    requirement.spend_amount_atomic !== undefined &&
    requirement.spend_token_symbol &&
    !requirement.spend_is_native
  ) {
    const { assets } = await fetchTokenAssets(wallet.privy_wallet_id, {
      evmChainId: requirement.evm_chain_id,
      includeUsd: false,
    });
    tokenBalanceWei = findTokenBalanceAtomic(assets, requirement.spend_token_symbol);
    if (tokenBalanceWei < requirement.spend_amount_atomic) {
      throw new AppError(
        400,
        "INSUFFICIENT_BALANCE",
        await buildInsufficientBalanceMessage(requirement, nativeWei, tokenBalanceWei),
        {
          evm_chain_id: requirement.evm_chain_id,
          network: requirement.network_label,
          token_symbol: requirement.spend_token_symbol,
          token_balance_atomic: tokenBalanceWei.toString(),
          required_token_atomic: requirement.spend_amount_atomic.toString(),
        },
      );
    }
  }

  if (nativeWei < requirement.gas_wei) {
    throw new AppError(
      400,
      "INSUFFICIENT_BALANCE",
      await buildInsufficientBalanceMessage(requirement, nativeWei, tokenBalanceWei),
      {
        evm_chain_id: requirement.evm_chain_id,
        network: requirement.network_label,
        native_wei: nativeWei.toString(),
        required_gas_wei: requirement.gas_wei.toString(),
      },
    );
  }
}

/** Test hooks */
export function setEvmBalancePreflightForTests(input: {
  fetchNativeBalance?: NativeBalanceFn | null;
  fetchTokenAssets?: TokenAssetsFn | null;
  resolveWallet?: ResolveWalletFn | null;
}): void {
  if (input.fetchNativeBalance !== undefined) {
    fetchNativeBalance =
      input.fetchNativeBalance ??
      (async (address, evmChainId) => {
        const chainId = resolveEvmChainId(evmChainId);
        const client = getEvmPublicClient(chainId);
        const balanceWei = await client.getBalance({ address: address as `0x${string}` });
        return { balance_atomic: balanceWei.toString() };
      });
  }
  if (input.fetchTokenAssets !== undefined) {
    fetchTokenAssets =
      input.fetchTokenAssets ??
      ((privyWalletId, options) => fetchEvmPrivyWalletAssets(privyWalletId, options));
  }
  if (input.resolveWallet !== undefined) {
    resolveWallet =
      input.resolveWallet ??
      ((privyUserId) => resolveAgentWalletByPrivyUserId(privyUserId, "ethereum"));
  }
}

export function resetEvmBalancePreflightForTests(): void {
  fetchNativeBalance = async (address, evmChainId) => {
    const chainId = resolveEvmChainId(evmChainId);
    const client = getEvmPublicClient(chainId);
    const balanceWei = await client.getBalance({ address: address as `0x${string}` });
    return { balance_atomic: balanceWei.toString() };
  };
  fetchTokenAssets = (privyWalletId, options) =>
    fetchEvmPrivyWalletAssets(privyWalletId, options);
  resolveWallet = (privyUserId) => resolveAgentWalletByPrivyUserId(privyUserId, "ethereum");
}
