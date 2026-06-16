import { Transaction } from "@mysten/sui/transactions";
import {
  deepbook,
  type DeepBookClient,
  type InterestConfigParams,
  type MarginPoolConfigParams,
  mainnetPackageIds,
  testnetPackageIds,
} from "@mysten/deepbook-v3";
import type { TxResult } from "../../chains/types.js";
import { AppError } from "../../../errors/app-error.js";
import {
  getDeepBookEnv,
  getMarginAdminCapId,
  getMarginMaintainerCapId,
  getMarginPackageId,
  getMarginPoolCapId,
  getMarginRegistryId,
  isDeepBookMarginMaintainerEnabled,
} from "../../../config/deepbook.js";
import { getSuiClient } from "../../../infrastructure/sui/client.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import { executeSignedSuiTransaction } from "../../wallet/sui-transaction.service.js";
import { signSuiTransactionBytes } from "../../wallet/sui-signing.service.js";
import { getPrivyClient } from "../../../infrastructure/privy/client.js";
import { resolveMarginPoolCoinKey } from "./margin-pool-coin-key.js";

export const MARGIN_MAINTAINER_ACTIONS = new Set([
  "deepbook_margin_maintainer_create_pool",
  "deepbook_margin_maintainer_enable_pool_for_loan",
  "deepbook_margin_maintainer_disable_pool_for_loan",
  "deepbook_margin_maintainer_update_interest_params",
  "deepbook_margin_maintainer_update_pool_config",
  "deepbook_margin_maintainer_withdraw_maintainer_fees",
  "deepbook_margin_maintainer_withdraw_protocol_fees",
  "deepbook_margin_maintainer_admin_withdraw_default_referral_fees",
]);

export type MarginMaintainerExecResult = TxResult & {
  margin_maintainer: {
    action: string;
    coin_type?: string;
    pool_key?: string;
  };
};

export function isDeepBookMarginMaintainerAction(action: string): boolean {
  return MARGIN_MAINTAINER_ACTIONS.has(action);
}

export function buildMarginMaintainerActionSummary(
  action: string,
  params: Record<string, unknown>,
): string {
  const coin = params.coin_type ?? params.coin_key ?? "";
  const pool = params.pool_key ?? "";
  switch (action) {
    case "deepbook_margin_maintainer_create_pool":
      return `Create margin pool for ${coin}`;
    case "deepbook_margin_maintainer_enable_pool_for_loan":
      return `Enable ${pool} for margin pool loans (${coin})`;
    case "deepbook_margin_maintainer_disable_pool_for_loan":
      return `Disable ${pool} for margin pool loans (${coin})`;
    case "deepbook_margin_maintainer_update_interest_params":
      return `Update margin pool interest params for ${coin}`;
    case "deepbook_margin_maintainer_update_pool_config":
      return `Update margin pool config for ${coin}`;
    case "deepbook_margin_maintainer_withdraw_maintainer_fees":
      return `Withdraw maintainer fees from margin pool ${coin}`;
    case "deepbook_margin_maintainer_withdraw_protocol_fees":
      return `Withdraw protocol fees from margin pool ${coin}`;
    case "deepbook_margin_maintainer_admin_withdraw_default_referral_fees":
      return `Admin withdraw default referral fees from margin pool ${coin}`;
    default:
      return `Margin maintainer action: ${action}`;
  }
}

function assertMarginMaintainerEnabled(): void {
  if (!isDeepBookMarginMaintainerEnabled()) {
    throw new AppError(
      403,
      "MAINTAINER_DISABLED",
      "Margin maintainer actions are disabled. Set DEEPBOOK_MARGIN_MAINTAINER_ENABLED=true and configure capability object IDs.",
    );
  }
}

function requireCapId(
  capId: string | undefined,
  envName: string,
  code: string,
): string {
  if (!capId?.startsWith("0x")) {
    throw new AppError(
      503,
      code,
      `Missing or invalid ${envName}. Margin maintainer actions require protocol capability object IDs in server env.`,
    );
  }
  return capId;
}

async function resolveSuiAgentWallet(privyUserId: string) {
  const wallet = await resolveAgentWalletByPrivyUserId(privyUserId, "sui");
  if (!wallet) {
    throw new AppError(404, "WALLET_NOT_FOUND", "No Sui agent wallet registered.");
  }
  if (!wallet.signer_added) {
    throw new AppError(403, "WALLET_SIGNER_NOT_CONFIGURED", "Session signer not configured.");
  }
  return wallet;
}

function buildMaintainerDeepBookClient(walletAddress: string): DeepBookClient {
  const env = getDeepBookEnv();
  const packageIds = env.env === "testnet" ? testnetPackageIds : mainnetPackageIds;
  const client = getSuiClient().$extend(
    deepbook({
      address: walletAddress,
      coins: env.coins,
      pools: env.pools,
      marginMaintainerCap: getMarginMaintainerCapId(),
      marginAdminCap: getMarginAdminCapId(),
      packageIds,
    }),
  );
  return (client as unknown as { deepbook: DeepBookClient }).deepbook;
}

async function buildAndSignExecuteMaintainer(
  privyUserId: string,
  walletAddress: string,
  build: (tx: Transaction, client: DeepBookClient) => void,
): Promise<TxResult> {
  const agentWallet = await resolveSuiAgentWallet(privyUserId);
  const privyWallet = await getPrivyClient().wallets().get(agentWallet.privy_wallet_id);
  if (!privyWallet.public_key) {
    throw new AppError(502, "WALLET_METADATA_MISSING", "Missing public key on wallet");
  }

  const dbClient = buildMaintainerDeepBookClient(walletAddress);
  const tx = new Transaction();
  tx.setSender(walletAddress);
  build(tx, dbClient);

  const transactionBytes = await tx.build({ client: getSuiClient() });
  const serializedSignature = await signSuiTransactionBytes({
    privyWalletId: agentWallet.privy_wallet_id,
    suiAddress: walletAddress,
    publicKeyBase58: privyWallet.public_key,
    transactionBytes,
  });

  const result = await executeSignedSuiTransaction({
    transactionBytes,
    serializedSignature,
    suiAddress: walletAddress,
  });

  return {
    chain_id: "sui",
    digest: result.digest,
    address: result.sui_address,
    effects_status: result.effects_status,
  };
}

function parseConfigSection(
  params: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const section = params[key];
  if (section && typeof section === "object" && !Array.isArray(section)) {
    return section as Record<string, unknown>;
  }
  return params;
}

function parseMarginPoolConfigParams(params: Record<string, unknown>): MarginPoolConfigParams {
  const cfg = parseConfigSection(params, "pool_config");
  const supplyCap = cfg.supply_cap ?? cfg.supplyCap;
  const maxUtilizationRate = cfg.max_utilization_rate ?? cfg.maxUtilizationRate;
  const protocolSpread = cfg.protocol_spread ?? cfg.protocolSpread;
  const minBorrow = cfg.min_borrow ?? cfg.minBorrow;

  if (supplyCap == null || maxUtilizationRate == null || protocolSpread == null || minBorrow == null) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "pool_config requires supply_cap, max_utilization_rate, protocol_spread, and min_borrow.",
    );
  }

  const config: MarginPoolConfigParams = {
    supplyCap: Number(supplyCap),
    maxUtilizationRate: Number(maxUtilizationRate),
    protocolSpread: Number(protocolSpread),
    minBorrow: Number(minBorrow),
  };

  const rateLimitCapacity = cfg.rate_limit_capacity ?? cfg.rateLimitCapacity;
  const rateLimitRefillRatePerMs = cfg.rate_limit_refill_rate_per_ms ?? cfg.rateLimitRefillRatePerMs;
  const rateLimitEnabled = cfg.rate_limit_enabled ?? cfg.rateLimitEnabled;
  if (
    rateLimitCapacity != null &&
    rateLimitRefillRatePerMs != null &&
    rateLimitEnabled != null
  ) {
    config.rateLimitCapacity = Number(rateLimitCapacity);
    config.rateLimitRefillRatePerMs = Number(rateLimitRefillRatePerMs);
    config.rateLimitEnabled = Boolean(rateLimitEnabled);
  }

  return config;
}

function parseInterestConfigParams(params: Record<string, unknown>): InterestConfigParams {
  const cfg = parseConfigSection(params, "interest_config");
  const baseRate = cfg.base_rate ?? cfg.baseRate;
  const baseSlope = cfg.base_slope ?? cfg.baseSlope;
  const optimalUtilization = cfg.optimal_utilization ?? cfg.optimalUtilization;
  const excessSlope = cfg.excess_slope ?? cfg.excessSlope;

  if (baseRate == null || baseSlope == null || optimalUtilization == null || excessSlope == null) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "interest_config requires base_rate, base_slope, optimal_utilization, and excess_slope.",
    );
  }

  return {
    baseRate: Number(baseRate),
    baseSlope: Number(baseSlope),
    optimalUtilization: Number(optimalUtilization),
    excessSlope: Number(excessSlope),
  };
}

function resolveDeepbookPoolKey(params: Record<string, unknown>): string {
  const poolKey = String(params.pool_key ?? params.poolKey ?? "").trim().toUpperCase();
  if (!poolKey) {
    throw new AppError(400, "VALIDATION_ERROR", "pool_key is required.");
  }
  const pools = getDeepBookEnv().pools;
  if (!(poolKey in pools)) {
    throw new AppError(400, "INVALID_POOL", `Unknown DeepBook pool key: ${poolKey}`);
  }
  return poolKey;
}

function requireMarginPoolCap(): string {
  return requireCapId(
    getMarginPoolCapId(),
    "DEEPBOOK_MARGIN_POOL_CAP_ID",
    "NO_MARGIN_POOL_CAP",
  );
}

function requireMarginMaintainerCap(): string {
  return requireCapId(
    getMarginMaintainerCapId(),
    "DEEPBOOK_MARGIN_MAINTAINER_CAP_ID",
    "NO_MARGIN_MAINTAINER_CAP",
  );
}

function requireMarginAdminCap(): string {
  return requireCapId(
    getMarginAdminCapId(),
    "DEEPBOOK_MARGIN_ADMIN_CAP_ID",
    "NO_MARGIN_ADMIN_CAP",
  );
}

function addWithdrawMaintainerFees(tx: Transaction, coinKey: string, marginPoolCapId: string): void {
  const marginPool = getDeepBookEnv().marginPools[coinKey];
  if (!marginPool) {
    throw new AppError(404, "INVALID_MARGIN_POOL_COIN", `No margin pool configured for ${coinKey}`);
  }
  tx.moveCall({
    target: `${getMarginPackageId()}::margin_pool::withdraw_maintainer_fees`,
    arguments: [
      tx.object(marginPool.address),
      tx.object(getMarginRegistryId()),
      tx.object(marginPoolCapId),
      tx.object.clock(),
    ],
    typeArguments: [marginPool.type],
  });
}

function addWithdrawProtocolFees(tx: Transaction, coinKey: string, marginAdminCapId: string): void {
  const marginPool = getDeepBookEnv().marginPools[coinKey];
  if (!marginPool) {
    throw new AppError(404, "INVALID_MARGIN_POOL_COIN", `No margin pool configured for ${coinKey}`);
  }
  tx.moveCall({
    target: `${getMarginPackageId()}::margin_pool::withdraw_protocol_fees`,
    arguments: [
      tx.object(marginPool.address),
      tx.object(getMarginRegistryId()),
      tx.object(marginAdminCapId),
      tx.object.clock(),
    ],
    typeArguments: [marginPool.type],
  });
}

export async function preflightMarginMaintainerAction(
  action: string,
  params: Record<string, unknown>,
): Promise<void> {
  assertMarginMaintainerEnabled();

  switch (action) {
    case "deepbook_margin_maintainer_create_pool": {
      resolveMarginPoolCoinKey(params.coin_type ?? params.coin_key);
      parseMarginPoolConfigParams(params);
      parseInterestConfigParams(params);
      requireMarginMaintainerCap();
      return;
    }
    case "deepbook_margin_maintainer_enable_pool_for_loan":
    case "deepbook_margin_maintainer_disable_pool_for_loan": {
      resolveDeepbookPoolKey(params);
      resolveMarginPoolCoinKey(params.coin_type ?? params.coin_key);
      requireMarginPoolCap();
      return;
    }
    case "deepbook_margin_maintainer_update_interest_params": {
      resolveMarginPoolCoinKey(params.coin_type ?? params.coin_key);
      parseInterestConfigParams(params);
      requireMarginPoolCap();
      return;
    }
    case "deepbook_margin_maintainer_update_pool_config": {
      resolveMarginPoolCoinKey(params.coin_type ?? params.coin_key);
      parseMarginPoolConfigParams(params);
      requireMarginPoolCap();
      return;
    }
    case "deepbook_margin_maintainer_withdraw_maintainer_fees": {
      resolveMarginPoolCoinKey(params.coin_type ?? params.coin_key);
      requireMarginPoolCap();
      return;
    }
    case "deepbook_margin_maintainer_withdraw_protocol_fees":
    case "deepbook_margin_maintainer_admin_withdraw_default_referral_fees": {
      resolveMarginPoolCoinKey(params.coin_type ?? params.coin_key);
      requireMarginAdminCap();
      return;
    }
    default:
      throw new AppError(400, "UNKNOWN_MARGIN_MAINTAINER_ACTION", `Unknown maintainer action: ${action}`);
  }
}

export async function executeMarginMaintainerAction(
  action: string,
  privyUserId: string,
  params: Record<string, unknown>,
): Promise<MarginMaintainerExecResult> {
  await preflightMarginMaintainerAction(action, params);
  const wallet = await resolveSuiAgentWallet(privyUserId);

  switch (action) {
    case "deepbook_margin_maintainer_create_pool": {
      const coinKey = resolveMarginPoolCoinKey(params.coin_type ?? params.coin_key);
      const poolConfig = parseMarginPoolConfigParams(params);
      const interestConfig = parseInterestConfigParams(params);
      requireMarginMaintainerCap();

      const result = await buildAndSignExecuteMaintainer(
        privyUserId,
        wallet.address,
        (tx, client) => {
          const protocolConfig = client.marginMaintainer.newProtocolConfig(
            coinKey,
            poolConfig,
            interestConfig,
          )(tx);
          tx.add(client.marginMaintainer.createMarginPool(coinKey, protocolConfig));
        },
      );

      return {
        ...result,
        margin_maintainer: { action: "create_pool", coin_type: coinKey },
      };
    }

    case "deepbook_margin_maintainer_enable_pool_for_loan": {
      const poolKey = resolveDeepbookPoolKey(params);
      const coinKey = resolveMarginPoolCoinKey(params.coin_type ?? params.coin_key);
      const marginPoolCapId = requireMarginPoolCap();

      const result = await buildAndSignExecuteMaintainer(
        privyUserId,
        wallet.address,
        (tx, client) => {
          tx.add(
            client.marginMaintainer.enableDeepbookPoolForLoan(
              poolKey,
              coinKey,
              tx.object(marginPoolCapId),
            ),
          );
        },
      );

      return {
        ...result,
        margin_maintainer: { action: "enable_pool_for_loan", coin_type: coinKey, pool_key: poolKey },
      };
    }

    case "deepbook_margin_maintainer_disable_pool_for_loan": {
      const poolKey = resolveDeepbookPoolKey(params);
      const coinKey = resolveMarginPoolCoinKey(params.coin_type ?? params.coin_key);
      const marginPoolCapId = requireMarginPoolCap();

      const result = await buildAndSignExecuteMaintainer(
        privyUserId,
        wallet.address,
        (tx, client) => {
          tx.add(
            client.marginMaintainer.disableDeepbookPoolForLoan(
              poolKey,
              coinKey,
              tx.object(marginPoolCapId),
            ),
          );
        },
      );

      return {
        ...result,
        margin_maintainer: { action: "disable_pool_for_loan", coin_type: coinKey, pool_key: poolKey },
      };
    }

    case "deepbook_margin_maintainer_update_interest_params": {
      const coinKey = resolveMarginPoolCoinKey(params.coin_type ?? params.coin_key);
      const interestConfig = parseInterestConfigParams(params);
      const marginPoolCapId = requireMarginPoolCap();

      const result = await buildAndSignExecuteMaintainer(
        privyUserId,
        wallet.address,
        (tx, client) => {
          tx.add(
            client.marginMaintainer.updateInterestParams(
              coinKey,
              tx.object(marginPoolCapId),
              interestConfig,
            ),
          );
        },
      );

      return {
        ...result,
        margin_maintainer: { action: "update_interest_params", coin_type: coinKey },
      };
    }

    case "deepbook_margin_maintainer_update_pool_config": {
      const coinKey = resolveMarginPoolCoinKey(params.coin_type ?? params.coin_key);
      const poolConfig = parseMarginPoolConfigParams(params);
      const marginPoolCapId = requireMarginPoolCap();

      const result = await buildAndSignExecuteMaintainer(
        privyUserId,
        wallet.address,
        (tx, client) => {
          tx.add(
            client.marginMaintainer.updateMarginPoolConfig(
              coinKey,
              tx.object(marginPoolCapId),
              poolConfig,
            ),
          );
        },
      );

      return {
        ...result,
        margin_maintainer: { action: "update_pool_config", coin_type: coinKey },
      };
    }

    case "deepbook_margin_maintainer_withdraw_maintainer_fees": {
      const coinKey = resolveMarginPoolCoinKey(params.coin_type ?? params.coin_key);
      const marginPoolCapId = requireMarginPoolCap();

      const result = await buildAndSignExecuteMaintainer(
        privyUserId,
        wallet.address,
        (tx) => {
          addWithdrawMaintainerFees(tx, coinKey, marginPoolCapId);
        },
      );

      return {
        ...result,
        margin_maintainer: { action: "withdraw_maintainer_fees", coin_type: coinKey },
      };
    }

    case "deepbook_margin_maintainer_withdraw_protocol_fees": {
      const coinKey = resolveMarginPoolCoinKey(params.coin_type ?? params.coin_key);
      const marginAdminCapId = requireMarginAdminCap();

      const result = await buildAndSignExecuteMaintainer(
        privyUserId,
        wallet.address,
        (tx) => {
          addWithdrawProtocolFees(tx, coinKey, marginAdminCapId);
        },
      );

      return {
        ...result,
        margin_maintainer: { action: "withdraw_protocol_fees", coin_type: coinKey },
      };
    }

    case "deepbook_margin_maintainer_admin_withdraw_default_referral_fees": {
      const coinKey = resolveMarginPoolCoinKey(params.coin_type ?? params.coin_key);
      requireMarginAdminCap();

      const result = await buildAndSignExecuteMaintainer(
        privyUserId,
        wallet.address,
        (tx, client) => {
          tx.add(client.marginAdmin.adminWithdrawDefaultReferralFees(coinKey));
        },
      );

      return {
        ...result,
        margin_maintainer: { action: "admin_withdraw_default_referral_fees", coin_type: coinKey },
      };
    }

    default:
      throw new AppError(400, "UNKNOWN_MARGIN_MAINTAINER_ACTION", `Unknown maintainer action: ${action}`);
  }
}
