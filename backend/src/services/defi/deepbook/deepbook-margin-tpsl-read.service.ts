import { deepbook, type DeepBookClient } from "@mysten/deepbook-v3";
import { getDeepBookEnv } from "../../../config/deepbook.js";
import { getSuiClient } from "../../../infrastructure/sui/client.js";
import { resolveAgentWalletByPrivyUserId } from "../../wallet/agent-wallet.service.js";
import { fetchMarginManagerIdsForOwner } from "./margin-manager-lookup.service.js";
import {
  DEFAULT_MARGIN_MANAGER_SDK_KEY,
  resolvePoolKeyForMarginManagerAddress,
} from "./deepbook-margin-read.service.js";

const DEFAULT_READ_WALLET = `0x${"0".repeat(64)}`;

export type MarginTpslInfoQueryResult = {
  provisioned: boolean;
  margin_manager_key?: string;
  margin_manager_address?: string;
  pool_key?: string;
  conditional_order_ids?: string[];
  lowest_trigger_above_price?: string;
  highest_trigger_below_price?: string;
  selected_conditional_order_id?: string;
  live_state_error?: string;
  note?: string;
};

function buildMarginTpslReadClient(
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

function serializeBigInt(value: bigint): string {
  return value.toString();
}

export function formatMarginTpslInfoSummary(result: MarginTpslInfoQueryResult): string {
  if (!result.provisioned) {
    return result.note ?? "No margin manager found for TPSL lookup.";
  }

  const lines = [
    `Margin manager ${result.margin_manager_address} on ${result.pool_key ?? "unknown pool"}.`,
  ];

  if (result.conditional_order_ids) {
    if (result.conditional_order_ids.length === 0) {
      lines.push("No conditional TPSL orders.");
    } else {
      lines.push(`Conditional order IDs: ${result.conditional_order_ids.join(", ")}.`);
    }
  }

  if (result.lowest_trigger_above_price != null) {
    lines.push(`Lowest take-profit trigger (above): ${result.lowest_trigger_above_price}.`);
  }
  if (result.highest_trigger_below_price != null) {
    lines.push(`Highest stop-loss trigger (below): ${result.highest_trigger_below_price}.`);
  }
  if (result.live_state_error) {
    lines.push(`Live TPSL lookup error: ${result.live_state_error}`);
  }

  return lines.join("\n");
}

export async function queryMarginTpslInfo(
  privyUserId: string,
  params: Record<string, unknown> = {},
): Promise<MarginTpslInfoQueryResult> {
  const wallet = await resolveAgentWalletByPrivyUserId(privyUserId, "sui");
  if (!wallet) {
    return {
      provisioned: false,
      note: "No Sui agent wallet found. The user needs to set up their wallet first.",
    };
  }

  const managerIds = await fetchMarginManagerIdsForOwner(wallet.address);
  if (managerIds.length === 0) {
    return {
      provisioned: false,
      note: "No margin manager found on-chain. Create one before using TPSL orders.",
    };
  }

  const marginManagerAddress = String(
    params.margin_manager_address ??
      params.marginManagerAddress ??
      managerIds[0],
  );

  let poolKey = String(params.pool_key ?? params.poolKey ?? "").trim().toUpperCase();
  if (!poolKey) {
    try {
      poolKey = await resolvePoolKeyForMarginManagerAddress(marginManagerAddress);
    } catch (err) {
      return {
        provisioned: true,
        margin_manager_key: "default",
        margin_manager_address: marginManagerAddress,
        live_state_error: err instanceof Error ? err.message : String(err),
        note: "Margin manager exists but pool key could not be resolved for TPSL reads.",
      };
    }
  }

  const readWallet = wallet.address ?? DEFAULT_READ_WALLET;
  const selectedId = params.conditional_order_id ?? params.conditionalOrderId;

  try {
    const client = buildMarginTpslReadClient(readWallet, marginManagerAddress, poolKey);
    const sdkKey = DEFAULT_MARGIN_MANAGER_SDK_KEY;

    const [orderIds, lowestAbove, highestBelow] = await Promise.all([
      client.getConditionalOrderIds(sdkKey),
      client.getLowestTriggerAbovePrice(sdkKey),
      client.getHighestTriggerBelowPrice(sdkKey),
    ]);

    const filteredIds =
      typeof selectedId === "string" && selectedId.trim().length > 0
        ? orderIds.filter((id) => id === String(selectedId).trim())
        : orderIds;

    return {
      provisioned: true,
      margin_manager_key: "default",
      margin_manager_address: marginManagerAddress,
      pool_key: poolKey,
      conditional_order_ids: filteredIds.length > 0 ? filteredIds : orderIds,
      lowest_trigger_above_price: serializeBigInt(lowestAbove),
      highest_trigger_below_price: serializeBigInt(highestBelow),
      ...(typeof selectedId === "string" && selectedId.trim().length > 0
        ? { selected_conditional_order_id: String(selectedId).trim() }
        : {}),
      note:
        orderIds.length === 0
          ? "No conditional orders on this margin manager. Add take-profit (trigger above price) or stop-loss (trigger below price) with deepbook_margin_tpsl_add."
          : "Take-profit orders trigger when price rises above trigger_price; stop-loss orders trigger when price falls below trigger_price.",
    };
  } catch (err) {
    return {
      provisioned: true,
      margin_manager_key: "default",
      margin_manager_address: marginManagerAddress,
      pool_key: poolKey,
      live_state_error: err instanceof Error ? err.message : String(err),
      note: "Margin manager exists but live TPSL state could not be fetched.",
    };
  }
}
