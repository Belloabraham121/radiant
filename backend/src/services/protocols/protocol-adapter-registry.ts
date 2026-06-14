import type { AppProtocolAdapter, AppProtocolId } from "./app-protocol-adapter.types.js";
import { deepBookAppAdapter } from "./deepbook-app.adapter.js";
import { genericAppAdapter } from "./generic-app.adapter.js";
import { polymarketAppAdapter } from "./polymarket-app.adapter.js";

const ADAPTERS: Record<AppProtocolId, AppProtocolAdapter> = {
  deepbook: deepBookAppAdapter,
  polymarket: polymarketAppAdapter,
  custom: genericAppAdapter,
};

export function listAppProtocolIds(): AppProtocolId[] {
  return Object.keys(ADAPTERS) as AppProtocolId[];
}

export function getAppProtocolAdapter(protocolId: AppProtocolId): AppProtocolAdapter {
  return ADAPTERS[protocolId];
}

export function listAppProtocolAdapters(): AppProtocolAdapter[] {
  return Object.values(ADAPTERS);
}
