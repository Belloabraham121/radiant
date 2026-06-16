import { Order, deepbook, type DeepBookClient } from "@mysten/deepbook-v3";
import { bcs } from "@mysten/sui/bcs";
import { Transaction } from "@mysten/sui/transactions";
import { getDeepBookEnv } from "../../../config/deepbook.js";
import { getSuiClient } from "../../../infrastructure/sui/client.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import type { OrderSummary } from "./types.js";
import { resolveMarginManagerIdsForUser } from "./margin-manager-lookup.service.js";
import {
  DEFAULT_MARGIN_MANAGER_SDK_KEY,
  resolvePoolKeyForMarginManagerAddress,
} from "./deepbook-margin-read.service.js";

export type MarginOpenOrdersQueryResult = {
  provisioned: boolean;
  margin_manager_key?: string;
  margin_manager_address?: string;
  pool_key?: string;
  orders: OrderSummary[];
  source: "sdk";
  note?: string;
  live_state_error?: string;
};

function buildMarginOpenOrdersReadClient(
  walletAddress: string,
  marginManagerAddress: string,
  poolKey: string,
): DeepBookClient {
  const { coins, pools } = getDeepBookEnv();
  const client = getSuiClient().$extend(
    deepbook({
      address: walletAddress,
      marginManagers: {
        [DEFAULT_MARGIN_MANAGER_SDK_KEY]: { address: marginManagerAddress, poolKey },
      },
      coins,
      pools,
    }),
  );
  return (client as unknown as { deepbook: DeepBookClient }).deepbook;
}

function mapSdkStatus(status: number): OrderSummary["status"] {
  if (status === 1) return "filled";
  if (status === 2) return "cancelled";
  return "open";
}

async function fetchMarginAccountOrderDetails(
  client: DeepBookClient,
  walletAddress: string,
  poolKey: string,
  marginManagerAddress: string,
): Promise<Array<{ order_id: string | bigint | number }>> {
  const tx = new Transaction();
  tx.setSender(walletAddress);
  tx.add(client.marginManager.getAccountOrderDetails(poolKey, marginManagerAddress));

  const res = await getSuiClient().core.simulateTransaction({
    transaction: tx,
    include: { commandResults: true, effects: true },
  });

  try {
    const orderInformation = res.commandResults![0].returnValues[0].bcs;
    return bcs.vector(Order).parse(new Uint8Array(orderInformation));
  } catch {
    return [];
  }
}

async function mapMarginOrdersToSummaries(
  poolKey: string,
  client: DeepBookClient,
  rawOrders: Array<{ order_id: string | bigint | number }>,
): Promise<OrderSummary[]> {
  const summaries: OrderSummary[] = [];

  for (const raw of rawOrders) {
    const orderId = String(raw.order_id);
    const normalized = await client.getOrderNormalized(poolKey, orderId);
    if (!normalized) continue;

    const quantity = Number(normalized.quantity);
    const filled = Number(normalized.filled_quantity);
    summaries.push({
      order_id: orderId,
      pool_key: poolKey,
      client_order_id: String(normalized.client_order_id),
      price: Number(normalized.normalized_price),
      quantity,
      remaining_quantity: Math.max(0, quantity - filled),
      is_bid: normalized.isBid,
      status: mapSdkStatus(normalized.status),
    });
  }

  return summaries;
}

export function formatMarginOpenOrdersSummary(result: MarginOpenOrdersQueryResult): string {
  if (!result.provisioned) {
    return result.note ?? "No margin manager found for open order lookup.";
  }

  const poolKey = result.pool_key ?? "unknown pool";
  if (result.live_state_error) {
    return (
      `Margin manager ${result.margin_manager_address} on ${poolKey}: ` +
      `open orders unavailable (${result.live_state_error}).`
    );
  }

  if (result.orders.length === 0) {
    return `No open margin orders on ${poolKey} for margin manager ${result.margin_manager_address}.`;
  }

  const lines = result.orders.slice(0, 8).map((order) => {
    const side = order.is_bid ? "buy" : "sell";
    return `${side} ${order.remaining_quantity} @ ${order.price} (id ${order.order_id.slice(0, 10)}…)`;
  });
  const suffix =
    result.orders.length > 8 ? `\n…and ${result.orders.length - 8} more` : "";

  return (
    `Open margin orders on ${poolKey} (${result.orders.length}):\n` +
    `${lines.join("\n")}${suffix}`
  );
}

function resolveMarginManagerAddress(
  params: Record<string, unknown>,
  managerIds: string[],
): string {
  const raw =
    params.margin_manager_address ??
    params.marginManagerAddress ??
    params.margin_manager_key;

  if (typeof raw === "string" && raw.startsWith("0x")) {
    return raw;
  }

  return managerIds[0];
}

function resolvePoolKeyParam(params: Record<string, unknown>): string | undefined {
  const raw = params.pool_key ?? params.poolKey;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return undefined;
  }
  return raw.trim().toUpperCase();
}

export async function queryMarginOpenOrders(
  privyUserId: string,
  params: Record<string, unknown> = {},
): Promise<MarginOpenOrdersQueryResult> {
  const wallet = await resolveAgentWalletByPrivyUserId(privyUserId, "sui");
  if (!wallet) {
    return {
      provisioned: false,
      orders: [],
      source: "sdk",
      note: "No Sui agent wallet found. The user needs to set up their wallet first.",
    };
  }

  const lookup = await resolveMarginManagerIdsForUser(privyUserId, wallet.address);
  const managerIds = lookup.margin_manager_ids;

  if (managerIds.length === 0) {
    return {
      provisioned: false,
      orders: [],
      source: "sdk",
      note: "No margin manager found on-chain. Create one before listing margin orders.",
    };
  }

  const marginManagerAddress = resolveMarginManagerAddress(params, managerIds);
  const poolKeyParam = resolvePoolKeyParam(params);
  let poolKey: string;

  try {
    poolKey =
      poolKeyParam ??
      (await resolvePoolKeyForMarginManagerAddress(marginManagerAddress));
  } catch (err) {
    return {
      provisioned: true,
      margin_manager_key: "default",
      margin_manager_address: marginManagerAddress,
      orders: [],
      source: "sdk",
      live_state_error: err instanceof Error ? err.message : String(err),
      note: "Margin manager exists but pool key could not be resolved for open order reads.",
    };
  }

  try {
    const client = buildMarginOpenOrdersReadClient(
      wallet.address,
      marginManagerAddress,
      poolKey,
    );
    const rawOrders = await fetchMarginAccountOrderDetails(
      client,
      wallet.address,
      poolKey,
      marginManagerAddress,
    );
    const orders = await mapMarginOrdersToSummaries(poolKey, client, rawOrders);
    orders.sort((a, b) => b.price - a.price);

    return {
      provisioned: true,
      margin_manager_key: "default",
      margin_manager_address: marginManagerAddress,
      pool_key: poolKey,
      orders,
      source: "sdk",
      note:
        lookup.source === "agent_ledger_fallback"
          ? "Margin manager recovered from recent agent transaction; open orders fetched via live SDK."
          : undefined,
    };
  } catch (err) {
    return {
      provisioned: true,
      margin_manager_key: "default",
      margin_manager_address: marginManagerAddress,
      pool_key: poolKey,
      orders: [],
      source: "sdk",
      live_state_error: err instanceof Error ? err.message : String(err),
      note: "Margin manager exists but open order lookup failed.",
    };
  }
}
