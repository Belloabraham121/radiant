import type {
  AppActionContext,
  AppActionName,
  AppActionResult,
} from "../projects/app-action.types.js";

/** Protocol identifier stored on project `action_schema.protocol` and adapter registry. */
export const APP_PROTOCOL_IDS = ["deepbook", "polymarket", "custom"] as const;

export type AppProtocolId = (typeof APP_PROTOCOL_IDS)[number];

/**
 * Pluggable protocol adapter — one implementation per on-chain product (DeepBook, Polymarket, …).
 * New protocols add an adapter + checklist items in docs/protocol-extension-kit.md.
 */
export type AppProtocolAdapter = {
  readonly id: AppProtocolId;
  /** Canonical app action names this adapter can execute. */
  supportedActions(): readonly AppActionName[];
  supportsAction(action: AppActionName): boolean;
  execute(
    action: AppActionName,
    params: unknown,
    ctx: AppActionContext,
  ): Promise<AppActionResult>;
};
