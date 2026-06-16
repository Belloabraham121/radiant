export const DEEPBOOK_PROVISION_MANAGER_ACTION = "deepbook_provision_manager" as const;
export const DEEPBOOK_PROVISION_MARGIN_MANAGER_ACTION = "deepbook_provision_margin_manager" as const;

export function isDeepBookProvisionAction(action: string): boolean {
  return action === DEEPBOOK_PROVISION_MANAGER_ACTION || action === DEEPBOOK_PROVISION_MARGIN_MANAGER_ACTION;
}
