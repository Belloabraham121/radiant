/** Reference margin trading app injected when generate_app uses template: "margin". */

export const MARGIN_APP_REFERENCE_VERSION = 1;

export type MarginReferenceFile = { path: string; content: string };

export const MARGIN_REFERENCE_APP_FILES: MarginReferenceFile[] = [
  {
    path: "app/page.tsx",
    content: `"use client";

import "../lib/radiant-agent-runtime";
import "../lib/margin-agent-handlers";
import MarginTradingApp from "../components/MarginTradingApp";

export default function Page() {
  return <MarginTradingApp />;
}
`,
  },
  {
    path: "lib/radiant-actions.ts",
    content: `/** Margin action manifest — parsed by Radiant for project_actions / session_actions. Template v${MARGIN_APP_REFERENCE_VERSION}. */
export const actions = [
  {
    name: "margin_provision_manager",
    description: "Create a DeepBook margin manager on a trading pool",
    params: [
      { name: "pool_key", type: "string", required: true },
      { name: "coin_type", type: "string", description: "Optional initial deposit: base | quote | deep" },
      { name: "amount", type: "number", description: "Optional initial deposit amount" },
    ],
  },
  {
    name: "margin_deposit",
    description: "Deposit collateral into the margin manager",
    params: [
      { name: "margin_manager_key", type: "string", description: 'Use "default"' },
      { name: "coin_type", type: "string", required: true, description: "base | quote | deep" },
      { name: "amount", type: "number", required: true },
    ],
  },
  {
    name: "margin_borrow",
    description: "Borrow from the margin pool to increase leverage",
    params: [
      { name: "margin_manager_key", type: "string", description: 'Use "default"' },
      { name: "asset", type: "string", required: true, description: "base | quote" },
      { name: "amount", type: "number", required: true },
    ],
  },
  {
    name: "margin_repay",
    description: "Repay borrowed margin debt",
    params: [
      { name: "margin_manager_key", type: "string", description: 'Use "default"' },
      { name: "asset", type: "string", required: true, description: "base | quote" },
      { name: "amount", type: "number" },
    ],
  },
  {
    name: "margin_place_limit_order",
    description: "Place a leveraged limit order",
    params: [
      { name: "pool_key", type: "string", required: true },
      { name: "margin_manager_key", type: "string", description: 'Use "default"' },
      { name: "price", type: "number", required: true },
      { name: "quantity", type: "number", required: true },
      { name: "is_bid", type: "boolean", required: true, description: "true = buy, false = sell" },
    ],
  },
  {
    name: "margin_place_market_order",
    description: "Place a leveraged market order",
    params: [
      { name: "pool_key", type: "string", required: true },
      { name: "margin_manager_key", type: "string", description: 'Use "default"' },
      { name: "quantity", type: "number", required: true },
      { name: "is_bid", type: "boolean", required: true, description: "true = buy, false = sell" },
    ],
  },
  {
    name: "margin_tpsl_add",
    description: "Add a take-profit or stop-loss conditional order",
    params: [
      { name: "pool_key", type: "string" },
      { name: "margin_manager_key", type: "string", description: 'Use "default"' },
      { name: "tpsl_type", type: "string", required: true, description: "take_profit | stop_loss" },
      { name: "trigger_price", type: "number", required: true },
      { name: "quantity", type: "number", required: true },
      { name: "is_bid", type: "boolean", description: "true = buy, false = sell" },
    ],
  },
];
`,
  },
  {
    path: "lib/margin-agent-handlers.ts",
    content: `/** Registers margin action handlers for agent-driven UI. Template v${MARGIN_APP_REFERENCE_VERSION}. */
import type { AppActionResult } from "./radiant-client";

type HandlerCtx = {
  setField: (targetId: string, value: unknown) => void;
  delay: (ms: number) => Promise<void>;
  highlight: (targetId: string, className?: string) => void;
  executeAction: (action: string, params: Record<string, unknown>) => Promise<AppActionResult>;
};

const SUBMIT_IDS: Record<string, string> = {
  margin_provision_manager: "margin-provision-submit",
  margin_deposit: "margin-deposit-submit",
  margin_borrow: "margin-borrow-submit",
  margin_repay: "margin-repay-submit",
  margin_place_limit_order: "margin-order-submit",
  margin_place_market_order: "margin-order-submit",
  margin_tpsl_add: "margin-tpsl-submit",
};

function toRadiantId(key: string): string {
  return key.replace(/_/g, "-");
}

async function driveAndExecute(
  action: string,
  params: Record<string, unknown>,
  ctx: HandlerCtx,
): Promise<AppActionResult> {
  for (const [key, value] of Object.entries(params)) {
    if (value == null || typeof value === "object") continue;
    ctx.setField(toRadiantId(key), value);
    await ctx.delay(350);
  }
  const submitId = SUBMIT_IDS[action] ?? "margin-deposit-submit";
  ctx.highlight(submitId, "agent-clicking");
  await ctx.delay(450);
  return await ctx.executeAction(action, params);
}

function registerMarginHandlers(): void {
  if (typeof window === "undefined" || !window.__radiantAgent) return;
  for (const action of Object.keys(SUBMIT_IDS)) {
    window.__radiantAgent.register(action, (params, ctx) =>
      driveAndExecute(action, params, ctx),
    );
  }
}

registerMarginHandlers();
`,
  },
  {
    path: "components/MarginTradingApp.tsx",
    content: `"use client";

import { useCallback, useEffect, useState } from "react";
import {
  executeAction,
  marginManagerInfo,
  marginPoolInfo,
  marginRiskRatio,
} from "../lib/radiant-client";

type Side = "buy" | "sell";

const DEFAULT_POOLS = ["SUI_DBUSDC", "SUI_USDC", "DEEP_USDC"];

function useAgentFieldSync(setters: Record<string, (value: string) => void>) {
  useEffect(() => {
    const onSetField = (event: Event) => {
      const detail = (event as CustomEvent<{ field?: string; value?: unknown }>).detail;
      const field = detail?.field;
      if (!field || !(field in setters)) return;
      setters[field]!(String(detail.value ?? ""));
    };
    window.addEventListener("radiant-agent-set-field", onSetField);
    return () => window.removeEventListener("radiant-agent-set-field", onSetField);
  }, [setters]);
}

export default function MarginTradingApp() {
  const [poolKey, setPoolKey] = useState(DEFAULT_POOLS[0] ?? "SUI_DBUSDC");
  const [depositCoin, setDepositCoin] = useState("base");
  const [depositAmount, setDepositAmount] = useState("");
  const [borrowAsset, setBorrowAsset] = useState("quote");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [orderPrice, setOrderPrice] = useState("");
  const [orderQty, setOrderQty] = useState("");
  const [orderSide, setOrderSide] = useState<Side>("buy");
  const [riskRatio, setRiskRatio] = useState<string>("—");
  const [managerStatus, setManagerStatus] = useState<string>("Loading margin manager…");
  const [poolSummary, setPoolSummary] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refreshState = useCallback(async () => {
    try {
      const [manager, risk, pool] = await Promise.all([
        marginManagerInfo(),
        marginRiskRatio(),
        marginPoolInfo(poolKey),
      ]);
      const provisioned = Boolean(manager.provisioned);
      setManagerStatus(
        provisioned
          ? "Margin manager: " + String(manager.margin_manager_address ?? "provisioned")
          : String(manager.note ?? "No margin manager — create one below."),
      );
      if (typeof risk.risk_ratio === "number") {
        setRiskRatio(risk.risk_ratio.toFixed(4));
      } else {
        setRiskRatio("—");
      }
      const pools = pool.available_margin_pools;
      if (Array.isArray(pools) && pools.length > 0) {
        setPoolSummary("Margin pools: " + pools.join(", "));
      } else {
        setPoolSummary("Pool: " + poolKey);
      }
    } catch (err) {
      setManagerStatus(err instanceof Error ? err.message : "Failed to load margin state");
    }
  }, [poolKey]);

  useEffect(() => {
    void refreshState();
    const onRefresh = () => void refreshState();
    window.addEventListener("radiant-agent-refresh", onRefresh);
    return () => window.removeEventListener("radiant-agent-refresh", onRefresh);
  }, [refreshState]);

  useAgentFieldSync({
    "pool-key": setPoolKey,
    "coin-type": setDepositCoin,
    amount: setDepositAmount,
    asset: setBorrowAsset,
    price: setOrderPrice,
    quantity: setOrderQty,
    side: (value) => setOrderSide(value === "sell" ? "sell" : "buy"),
    "is-bid": (value) => setOrderSide(value === "false" || value === "sell" ? "sell" : "buy"),
  });

  async function runAction(action: string, params: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const result = await executeAction(action, params);
      if (result.status === "executed") {
        setMessage(action + " submitted — digest " + (result.digest || "pending"));
        await refreshState();
      } else if (result.status === "approval_required") {
        setMessage("Confirm " + action + " in the approval dialog.");
      } else if (result.status === "error") {
        setMessage(result.error?.message ?? "Action failed");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Margin Trading</h1>
        <p className="mt-1 text-sm text-gray-600">DeepBook margin — provision, fund, borrow, and trade with leverage.</p>
      </header>

      <input type="hidden" data-radiant-id="margin-manager-key" value="default" readOnly />

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Account</h2>
        <p className="mt-2 text-sm text-gray-800">{managerStatus}</p>
        <p className="mt-1 text-sm text-gray-600">{poolSummary}</p>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Risk ratio</span>
          <span data-radiant-id="risk-ratio-display" className="rounded-md bg-violet-50 px-3 py-1 text-sm font-bold text-violet-900">
            {riskRatio}
          </span>
          <button type="button" className="text-sm text-violet-700 underline" onClick={() => void refreshState()}>
            Refresh
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Pool &amp; provision</h2>
        <label className="mt-3 block text-sm font-medium text-gray-700" htmlFor="pool-key">
          Trading pool
        </label>
        <select
          id="pool-key"
          data-radiant-id="pool-key"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          value={poolKey}
          onChange={(e) => setPoolKey(e.target.value)}
        >
          {DEFAULT_POOLS.map((pool) => (
            <option key={pool} value={pool}>
              {pool}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-radiant-id="margin-provision-submit"
          disabled={busy}
          className="mt-4 w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          onClick={() => void runAction("margin_provision_manager", { pool_key: poolKey })}
        >
          Create margin account
        </button>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Deposit</h2>
          <label className="mt-3 block text-sm font-medium text-gray-700" htmlFor="coin-type">
            Coin
          </label>
          <select
            id="coin-type"
            data-radiant-id="coin-type"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={depositCoin}
            onChange={(e) => setDepositCoin(e.target.value)}
          >
            <option value="base">base</option>
            <option value="quote">quote</option>
            <option value="deep">deep</option>
          </select>
          <label className="mt-3 block text-sm font-medium text-gray-700" htmlFor="deposit-amount">
            Amount
          </label>
          <input
            id="deposit-amount"
            data-radiant-id="amount"
            type="number"
            min="0"
            step="any"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
          />
          <button
            type="button"
            data-radiant-id="margin-deposit-submit"
            disabled={busy}
            className="mt-4 w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() =>
              void runAction("margin_deposit", {
                coin_type: depositCoin,
                amount: Number(depositAmount),
              })
            }
          >
            Deposit collateral
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Borrow</h2>
          <label className="mt-3 block text-sm font-medium text-gray-700" htmlFor="borrow-asset">
            Asset
          </label>
          <select
            id="borrow-asset"
            data-radiant-id="asset"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={borrowAsset}
            onChange={(e) => setBorrowAsset(e.target.value)}
          >
            <option value="base">base</option>
            <option value="quote">quote</option>
          </select>
          <label className="mt-3 block text-sm font-medium text-gray-700" htmlFor="borrow-amount">
            Amount
          </label>
          <input
            id="borrow-amount"
            data-radiant-id="amount"
            type="number"
            min="0"
            step="any"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={borrowAmount}
            onChange={(e) => setBorrowAmount(e.target.value)}
          />
          <button
            type="button"
            data-radiant-id="margin-borrow-submit"
            disabled={busy}
            className="mt-4 w-full rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() =>
              void runAction("margin_borrow", {
                asset: borrowAsset,
                amount: Number(borrowAmount),
              })
            }
          >
            Borrow
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Limit order</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="order-price">
              Price
            </label>
            <input
              id="order-price"
              data-radiant-id="price"
              type="number"
              min="0"
              step="any"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={orderPrice}
              onChange={(e) => setOrderPrice(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="order-qty">
              Quantity
            </label>
            <input
              id="order-qty"
              data-radiant-id="quantity"
              type="number"
              min="0"
              step="any"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={orderQty}
              onChange={(e) => setOrderQty(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="order-side">
              Side
            </label>
            <select
              id="order-side"
              data-radiant-id="side"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={orderSide}
              onChange={(e) => setOrderSide(e.target.value as Side)}
            >
              <option value="buy">buy</option>
              <option value="sell">sell</option>
            </select>
          </div>
        </div>
        <button
          type="button"
          data-radiant-id="margin-order-submit"
          disabled={busy}
          className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          onClick={() =>
            void runAction("margin_place_limit_order", {
              pool_key: poolKey,
              price: Number(orderPrice),
              quantity: Number(orderQty),
              is_bid: orderSide === "buy",
            })
          }
        >
          Place limit order
        </button>
      </section>

      {message ? <p className="text-sm text-gray-700">{message}</p> : null}
    </main>
  );
}
`,
  },
];

export function mergeMarginReferenceFiles<T extends { path: string; content: string }>(
  files: T[],
): T[] {
  const normalize = (path: string) => path.replace(/^\/+/, "").replace(/^\/workspace\//, "");
  const existing = new Set(files.map((file) => normalize(file.path)));
  const merged: T[] = [...files];
  for (const reference of MARGIN_REFERENCE_APP_FILES) {
    const path = normalize(reference.path);
    if (!existing.has(path)) {
      merged.push({ path, content: reference.content } as T);
      existing.add(path);
    }
  }
  return merged;
}
