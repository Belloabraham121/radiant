export type WorkflowStatus = "live" | "dry" | "draft";

export type WorkflowListItem = {
  id: string;
  name: string;
  status: WorkflowStatus;
  /** Human-readable last-run label (prototype only). */
  lastRun?: string;
  runsToday?: number;
};

export const WORKFLOW_STATUS_META: Record<
  WorkflowStatus,
  { color: string; label: string; dim?: boolean }
> = {
  live: { color: "var(--hero-mint)", label: "Live" },
  dry: { color: "var(--hero-amber)", label: "Dry run" },
  draft: { color: "var(--hero-ink)", label: "Draft", dim: true },
};

export const WORKFLOW_STATUS_ORDER: WorkflowStatus[] = ["live", "dry", "draft"];

/** Static workflow list for the Phase 0 prototype (no backend). */
export const SAMPLE_WORKFLOWS: WorkflowListItem[] = [
  { id: "btc-dip", name: "BTC dip buyer", status: "live", lastRun: "2m ago", runsToday: 3 },
  { id: "whale-copy", name: "Whale copy trade", status: "live", lastRun: "14m ago", runsToday: 7 },
  { id: "eth-ladder", name: "ETH limit ladder", status: "dry", lastRun: "1h ago" },
  { id: "sui-rebalance", name: "Sui weekly rebalance", status: "draft" },
];
