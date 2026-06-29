import type { PortKind } from "./canvas-nodes";

export type PortDoc = { description: string; example: unknown };

export type PortDocs = {
  inputs?: Partial<Record<PortKind, PortDoc>>;
  outputs?: Partial<Record<PortKind, PortDoc>>;
};

/** Realistic port payload examples aligned with backend dry-run handlers. */
export const NODE_PORT_DOCS: Record<string, PortDocs> = {
  "workflow-start": {
    outputs: {
      trigger: {
        description: "Fires once when the workflow run begins.",
        example: { source: "dry_run", run_id: "run_abc123", started_at: "2026-06-29T12:00:00.000Z" },
      },
    },
  },
  "workflow-approve": {
    inputs: {
      trigger: { description: "Upstream branch that reached the approval gate.", example: { branch: "true", value: true } },
      order_intent: {
        description: "Optional action preview shown in the approval UI.",
        example: { side: "buy", outcome: "yes", size_usd: 50, est_usd: 50 },
      },
    },
    outputs: {
      trigger: {
        description: "Emits after approval (auto in dry run).",
        example: { approved: true, auto: true, preview: { side: "buy", size_usd: 50 } },
      },
    },
  },
  "workflow-stop": {
    inputs: {
      trigger: { description: "Optional trigger to stop after upstream completes.", example: { passthrough: true } },
      signal: { description: "Completion or error signal from an action node.", example: { status: "filled", order_id: "sim-abc123" } },
    },
    outputs: {},
  },
  "price-chart": {
    inputs: {
      signal: { description: "Optional control signal (refresh, interval change).", example: { refresh: true } },
      data: { description: "Optional upstream OHLCV series to bind.", example: { pair: "BTC/USD", candles: [{ t: 1719667200, o: 62000, h: 62500, l: 61800, c: 62300 }] } },
    },
    outputs: {
      data: { description: "Latest chart series for downstream logic/UI.", example: { pair: "BTC/USD", interval: "1h", last: 62300 } },
    },
  },
  "whale-tx-tracker": {
    outputs: {
      trigger: { description: "Fires when a transfer exceeds the USD threshold.", example: { tx_hash: "0xabc…", usd: 250000, token: "USDC" } },
      data: { description: "Transfer details for downstream filters.", example: { from: "0xwhale…", to: "0xdest…", amount: "500000", usd: 250000 } },
    },
  },
  "wallet-balance": {
    inputs: {
      trigger: { description: "Poll or run-once trigger.", example: { passthrough: true } },
    },
    outputs: {
      data: {
        description: "Agent wallet balances used for gating.",
        example: { usdc: 1250.42, pusd: 500, chain: "polygon", address: "0xagent…" },
      },
    },
  },
  "if-condition": {
    inputs: {
      trigger: { description: "Branch input — waits for upstream trigger.", example: { crossed: true, value: 0.38 } },
      data: { description: "Value or object evaluated against the expression.", example: { value: true, mid: 0.38 } },
    },
    outputs: {
      trigger: { description: "Emits with branch outcome.", example: { branch: "true", value: true } },
    },
  },
  compare: {
    inputs: {
      data: { description: "Numeric values to compare (one or two wires).", example: 0.42 },
    },
    outputs: {
      signal: { description: "Boolean comparison result.", example: true },
      trigger: { description: "Fires when comparison is true.", example: { compared: true, a: 0.42, b: 0.4, operator: ">" } },
    },
  },
  threshold: {
    inputs: {
      data: {
        description: "Metric payload — reads mid, best_bid, best_ask, or scalar value.",
        example: { mid: 0.38, best_bid: 0.37, best_ask: 0.39, spread: 0.02 },
      },
    },
    outputs: {
      trigger: { description: "Fires when the metric crosses the bound.", example: { crossed: true, value: 0.38, threshold: 0.4 } },
      signal: { description: "Always emits current value vs threshold.", example: { value: 0.38, threshold: 0.4, crossed: false } },
    },
  },
  "policy-gate": {
    inputs: {
      order_intent: { description: "Proposed action checked against workflow policy.", example: { side: "buy", est_usd: 75, venue: "polymarket" } },
      trigger: { description: "Upstream trigger to evaluate policy.", example: { approved: true } },
    },
    outputs: {
      trigger: { description: "Passes when policy allows.", example: { allowed: true, dry_run: true } },
      data: { description: "Echo of the intent after policy check.", example: { side: "buy", est_usd: 75 } },
    },
  },
  "dry-run-gate": {
    inputs: {
      order_intent: { description: "Order intent to route.", example: { side: "buy", size_usd: 50, venue: "polymarket" } },
      trigger: { description: "Upstream trigger.", example: { approved: true } },
    },
    outputs: {
      trigger: { description: "Routed path indicator.", example: { routed: "simulator" } },
      order_intent: { description: "Intent marked simulated in Dry mode.", example: { side: "buy", size_usd: 50, simulated: true } },
    },
  },
  "place-order": {
    inputs: {
      trigger: { description: "Execute when triggered.", example: { approved: true } },
      market: { description: "Market context from a feed node.", example: { asset_id: "12345", mid: 0.39, outcome: "yes" } },
      order_intent: { description: "Optional pre-built intent overrides.", example: { side: "buy", size: 50 } },
    },
    outputs: {
      data: { description: "Fill or order acknowledgement.", example: { simulated: true, status: "filled", fill_price: 0.42, order_id: "sim-abc123" } },
    },
  },
  swap: {
    inputs: {
      trigger: { description: "Execute swap when triggered.", example: { approved: true } },
      order_intent: { description: "Swap route intent from Li-Fi quote or upstream.", example: { from_chain_id: 137, to_chain_id: 137, from_token: "USDC", to_token: "WETH", amount: "100" } },
    },
    outputs: {
      data: { description: "Swap execution result.", example: { simulated: true, status: "filled", tx_hash: "0xsim…", route_id: "lifi-abc" } },
    },
  },
  bridge: {
    inputs: {
      trigger: { description: "Execute bridge when triggered.", example: { approved: true } },
      order_intent: { description: "Bridge route intent.", example: { from_chain_id: 1, to_chain_id: 137, from_token: "ETH", to_token: "USDC", amount: "0.5" } },
    },
    outputs: {
      data: { description: "Bridge execution / route status.", example: { simulated: true, status: "pending", route_id: "lifi-bridge-xyz" } },
    },
  },
  transfer: {
    inputs: {
      trigger: { description: "Send when triggered.", example: { approved: true } },
      order_intent: { description: "Transfer intent (token, amount, recipient).", example: { token: "USDC", amount: "25", to: "0xrecipient…" } },
    },
    outputs: {
      data: { description: "Transfer receipt.", example: { simulated: true, status: "sent", tx_hash: "0xsim…" } },
    },
  },
  "copy-trade": {
    inputs: {
      trigger: { description: "Evaluate leader activity when triggered.", example: { passthrough: true } },
      data: { description: "Leader wallet or trade feed.", example: { leader: "0xleader…", last_trade: { side: "buy", usd: 4200 } } },
      signal: { description: "Optional AI filter signal.", example: { allow: true, confidence: 0.82 } },
      market: { description: "Target market context.", example: { asset_id: "12345", mid: 0.41 } },
    },
    outputs: {
      order_intent: { description: "Mirrored trade intent.", example: { side: "buy", outcome: "yes", size_usd: 42, mirror_pct: 100 } },
      data: { description: "Copy trade metadata.", example: { leader: "0xleader…", mirrored: true } },
    },
  },
  "polymarket-market": {
    outputs: {
      market: { description: "Market handle for order nodes.", example: { asset_id: "71321045679252212594626385532706912789722728594532913569215680388360801007528", outcome: "yes", mid: 0.39 } },
      data: { description: "Book, mid, spread, and last trade.", example: { mid: 0.39, best_bid: 0.38, best_ask: 0.4, spread: 0.02, last_trade: { price: 0.39, size: 1200 } } },
    },
  },
  "polymarket-order": {
    inputs: {
      trigger: { description: "Place/cancel when triggered.", example: { approved: true } },
      market: { description: "Connected market feed.", example: { asset_id: "71321…", mid: 0.39 } },
      order_intent: { description: "Optional intent override.", example: { side: "buy", size: 50 } },
    },
    outputs: {
      data: { description: "Order result.", example: { simulated: true, status: "filled", fill_price: 0.42, order_id: "sim-abc123" } },
    },
  },
  "polymarket-positions": {
    inputs: {
      trigger: { description: "Refresh on trigger.", example: { passthrough: true } },
    },
    outputs: {
      data: { description: "Open positions and orders.", example: { positions: [{ market: "BTC > 100k", side: "YES", size_usd: 120 }], allowance_ok: true } },
      signal: { description: "Balance or allowance warnings.", example: { low_allowance: false } },
    },
  },
  "lifi-quote": {
    inputs: {
      trigger: { description: "Fetch quote when triggered.", example: { passthrough: true } },
    },
    outputs: {
      order_intent: { description: "Route intent for swap/bridge nodes.", example: { from_chain_id: 137, to_chain_id: 42161, from_token: "USDC", to_token: "ETH", slippage_bps: 50 } },
      data: { description: "Quote details.", example: { route_id: "lifi-abc", est_gas: "0.002", est_time_s: 45 } },
    },
  },
  "lifi-route-status": {
    inputs: {
      trigger: { description: "Poll status when triggered.", example: { passthrough: true } },
    },
    outputs: {
      data: { description: "In-flight route status.", example: { route_id: "lifi-abc", status: "DONE", tx_hash: "0x…" } },
    },
  },
  "limitless-market": {
    outputs: {
      market: { description: "Limitless market handle.", example: { slug: "btc-100k", outcome: "yes", mid: 0.45 } },
      data: { description: "Book and price data.", example: { mid: 0.45, best_bid: 0.44, best_ask: 0.46 } },
    },
  },
  "limitless-order": {
    inputs: {
      trigger: { description: "Execute when triggered.", example: { approved: true } },
      market: { description: "Connected Limitless market.", example: { slug: "btc-100k", mid: 0.45 } },
      order_intent: { description: "Optional intent override.", example: { side: "buy", size: 50 } },
    },
    outputs: {
      data: { description: "Order result (coming soon in Live).", example: { simulated: true, status: "pending" } },
    },
  },
  "limitless-positions": {
    inputs: {
      trigger: { description: "Refresh on trigger.", example: { passthrough: true } },
    },
    outputs: {
      data: { description: "Positions on Limitless.", example: { positions: [{ market: "ETH > 4k", side: "NO", size_usd: 60 }] } },
      signal: { description: "Status signals.", example: { connected: true } },
    },
  },
  "ui-button": {
    inputs: {
      data: { description: "Label or bound state for the button.", example: { label: "Execute", enabled: true } },
    },
    outputs: {
      trigger: { description: "Fires on user click.", example: { click: "simulated" } },
    },
  },
  "ui-table": {
    inputs: {
      data: { description: "Tabular rows to display.", example: { columns: ["market", "side", "size"], rows: [["BTC > 100k", "YES", "$120"]] } },
    },
    outputs: {
      signal: { description: "Row selection or interaction signal.", example: { selected_row: 0 } },
    },
  },
  "ui-label": {
    inputs: {
      data: { description: "Primary value to display.", example: { text: "Mid: 0.39" } },
      signal: { description: "Optional status signal (color/badge).", example: { tone: "success" } },
    },
    outputs: {},
  },
  "ui-chart": {
    inputs: {
      data: { description: "Series data to chart.", example: { series: [{ t: 1, v: 0.38 }, { t: 2, v: 0.39 }] } },
    },
    outputs: {
      data: { description: "Chart interaction output.", example: { selected_point: { t: 2, v: 0.39 } } },
    },
  },
  "ai-reason": {
    inputs: {
      trigger: { description: "Run LLM step when triggered.", example: { passthrough: true } },
      data: { description: "Context payload for the prompt.", example: { market: "BTC > 100k", mid: 0.38, news: "ETF inflows" } },
    },
    outputs: {
      signal: { description: "Classification or decision signal.", example: { decision: "buy", confidence: 0.78 } },
      data: { description: "Full LLM response.", example: { reasoning: "Odds mispriced vs spot momentum.", decision: "buy" } },
    },
  },
  "schedule-cron": {
    outputs: {
      trigger: { description: "Fires on schedule (cron or interval).", example: { source: "cron", expression: "0 9 * * *", fired_at: "2026-06-29T09:00:00.000Z" } },
    },
  },
  notify: {
    inputs: {
      trigger: { description: "Send notification when triggered.", example: { crossed: true } },
      data: { description: "Payload merged into the message template.", example: { market: "BTC > 100k", mid: 0.38 } },
    },
    outputs: {
      data: { description: "Delivery acknowledgement.", example: { delivered: false, simulated: true, message: "Threshold crossed: 0.38" } },
    },
  },
  delay: {
    inputs: {
      trigger: { description: "Start delay when triggered.", example: { approved: true } },
    },
    outputs: {
      trigger: { description: "Fires after duration (durable resume).", example: { resumed: true, duration_seconds: 60 } },
    },
  },
};
