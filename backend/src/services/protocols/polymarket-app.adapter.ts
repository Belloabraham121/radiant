import { AppError } from "../../errors/app-error.js";
import type { AppActionContext, AppActionName, AppActionResult } from "../projects/app-action.types.js";
import type { AppProtocolAdapter } from "./app-protocol-adapter.types.js";

/**
 * Stub Polymarket adapter — proves the extension pattern before real CLOB integration.
 * See docs/protocol-extension-kit.md for the full checklist.
 */
export const polymarketAppAdapter: AppProtocolAdapter = {
  id: "polymarket",

  supportedActions() {
    return [];
  },

  supportsAction(_action: AppActionName) {
    return false;
  },

  async execute(
    action: AppActionName,
    _params: unknown,
    _ctx: AppActionContext,
  ): Promise<AppActionResult> {
    throw new AppError(
      501,
      "PROTOCOL_NOT_IMPLEMENTED",
      `Polymarket adapter does not implement action "${action}" yet. Follow docs/protocol-extension-kit.md.`,
      { protocol: "polymarket", action },
    );
  },
};
