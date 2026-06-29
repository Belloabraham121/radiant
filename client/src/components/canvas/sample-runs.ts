export type RunNodeStatus = "ok" | "failed" | "skipped" | "running";

export type RunNodeTrace = {
  node: string;
  category: "control" | "data" | "logic" | "action" | "ai" | "ui";
  status: RunNodeStatus;
  /** ms, or "auto" for human-gate steps that resolved automatically. */
  duration?: number | "auto";
  /** One-line summary of the node's inputs/outputs/decision. */
  detail?: string;
  /** Failure reason (shown expanded + red when status = failed). */
  error?: string;
  /** "What to do" remediation hint for a failed node. */
  hint?: string;
  /** Tx hash label for action nodes. */
  tx?: string;
};

export type RunStatus = "done" | "failed" | "running" | "skipped";

export type WorkflowRun = {
  id: string;
  time: string;
  trigger: string;
  status: RunStatus;
  durationLabel: string;
  mode: "live" | "dry";
  feeLabel?: string;
  trace: RunNodeTrace[];
};

/** Static runs for the open prototype workflow ("BTC dip buyer"). */
export const SAMPLE_RUNS: WorkflowRun[] = [
  {
    id: "run-0945",
    time: "09:45:01",
    trigger: "whale tx · 0x9f…21 bought $42k",
    status: "failed",
    durationLabel: "0.3s",
    mode: "live",
    trace: [
      { node: "Start", category: "control", status: "ok", duration: "auto", detail: "entry: whale tx" },
      { node: "Price Chart", category: "data", status: "ok", duration: 12, detail: "close 94,210 · Δ −5.2%" },
      { node: "Polymarket Feed", category: "data", status: "ok", duration: 9, detail: "mid 0.38 · spread 2bps" },
      { node: "IF — drop & odds", category: "logic", status: "ok", duration: 2, detail: "TRUE (−5% AND mid < 0.40)" },
      { node: "Policy Gate", category: "logic", status: "ok", duration: 1, detail: "PASS · $50 ≤ $200/24h" },
      { node: "Approve", category: "control", status: "ok", duration: "auto", detail: "pre-authorized" },
      {
        node: "Place Order",
        category: "action",
        status: "failed",
        duration: 280,
        detail: "BUY $50 YES @ 0.39 on Polymarket",
        error:
          "INSUFFICIENT_BALANCE — order needs $50.00 pUSD, agent wallet holds $32.10 on Polygon.",
        hint: "Top up pUSD on Polygon, or lower the order size to ≤ $32 (Place Order config), then re-run. Add a Wallet Balance gate before this node to skip when underfunded.",
      },
    ],
  },
  {
    id: "run-1432",
    time: "14:32:07",
    trigger: "BTC −5.2% on 1h",
    status: "done",
    durationLabel: "1.4s",
    mode: "live",
    feeLabel: "$0.05",
    trace: [
      { node: "Start", category: "control", status: "ok", duration: "auto", detail: "entry: threshold" },
      { node: "Price Chart", category: "data", status: "ok", duration: 12, detail: "close 94,210 · Δ −5.2%" },
      { node: "Polymarket Feed", category: "data", status: "ok", duration: 8, detail: "mid 0.38 · spread 2bps" },
      { node: "IF — drop & odds", category: "logic", status: "ok", duration: 2, detail: "TRUE" },
      { node: "Policy Gate", category: "logic", status: "ok", duration: 1, detail: "PASS · $50 ≤ $200/24h" },
      { node: "Approve", category: "control", status: "ok", duration: "auto", detail: "pre-authorized" },
      {
        node: "Place Order",
        category: "action",
        status: "ok",
        duration: 320,
        detail: "BUY $50 YES @ 0.39 · filled",
        tx: "0xab…3f",
      },
    ],
  },
  {
    id: "run-1108",
    time: "11:08:55",
    trigger: "cron · hourly",
    status: "done",
    durationLabel: "0.9s",
    mode: "live",
    feeLabel: "$0.05",
    trace: [
      { node: "Start", category: "control", status: "ok", duration: "auto", detail: "entry: cron" },
      { node: "IF — drop & odds", category: "logic", status: "ok", duration: 2, detail: "TRUE" },
      { node: "Place Order", category: "action", status: "ok", duration: 300, detail: "BUY $25 YES", tx: "0x77…d2" },
    ],
  },
  {
    id: "run-0800",
    time: "08:00:00",
    trigger: "cron · hourly",
    status: "skipped",
    durationLabel: "—",
    mode: "live",
    trace: [
      { node: "Start", category: "control", status: "ok", duration: "auto", detail: "entry: cron" },
      { node: "IF — drop & odds", category: "logic", status: "ok", duration: 2, detail: "FALSE (BTC −0.4%)" },
      { node: "Place Order", category: "action", status: "skipped", detail: "condition not met" },
    ],
  },
];
