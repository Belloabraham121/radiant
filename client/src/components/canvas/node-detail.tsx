"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X, Trash2 } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import {
  getNodeStatus,
  isConfigFieldVisible,
  PORT_COLOR,
  PORT_LABEL,
  type BranchRule,
  type CanvasPort,
  type ConfigField,
  type ConfigValue,
  type RichNode as RichNodeType,
} from "./canvas-nodes";
import { NodeGlyph, isImageLogo } from "./node-glyph";
import { findCatalogEntryForNode } from "@/lib/canvas-graph-mapper";
import type { PortDoc } from "./node-port-docs";
import { useActiveCanvasWorkflow } from "./canvas-workflow-context";
import { isPreviewConfigReady, useCanvasNodePreview } from "@/hooks/useCanvasNodePreview";
import { getCanvasWorkflowPolicy, type CanvasPolicyDetail } from "@/lib/canvas-api";
import { PolymarketMarketPicker } from "./PolymarketMarketPicker";
import { JsonDataView } from "./node-data-view";

const PREVIEW_BOX =
  "rounded-lg border-2 border-dashed border-[var(--hero-ink)]/15 bg-[var(--hero-bg)]";

/** Flatten an example payload into dot-paths (price.mid, book.bids[0].price…). */
function collectFieldPaths(value: unknown, prefix = "", out: string[] = []): string[] {
  if (Array.isArray(value)) {
    if (value.length > 0) collectFieldPaths(value[0], `${prefix}[0]`, out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${k}` : k;
      out.push(path);
      collectFieldPaths(v, path, out);
    }
  }
  return out;
}

function OrderPreview({ values }: { values: Record<string, ConfigValue> }) {
  const op = String(values.operation ?? "place_limit");
  if (op === "cancel") {
    return (
      <div className={`${PREVIEW_BOX} flex items-center justify-between px-3 py-2 text-xs`}>
        <span className="font-bold text-[var(--hero-coral)]">CANCEL</span>
        <span className="font-mono text-[var(--hero-ink)]/55">{String(values.order_id || "—")}</span>
      </div>
    );
  }
  const side = String(values.side ?? "buy").toUpperCase();
  const outcome = String(values.outcome ?? "yes").toUpperCase();
  const size = values.size ?? "";
  return (
    <div className={`${PREVIEW_BOX} px-3 py-2 text-xs`}>
      <div className="flex justify-between font-bold">
        <span className={side === "BUY" ? "text-[var(--hero-mint)]" : "text-[var(--hero-coral)]"}>
          {side} · {outcome}
        </span>
        <span className="text-[var(--hero-ink)]/55">~${String(size)}</span>
      </div>
      <div className="mt-1 flex justify-between text-[var(--hero-ink)]/45">
        <span>{op === "place_market" ? "market price" : `@ ${String(values.price ?? "")}`}</span>
        <span>allowance ok</span>
      </div>
    </div>
  );
}

function BookPreviewLive({ nodeId, data }: { nodeId: string; data: RichNodeType["data"] }) {
  const { workflow } = useActiveCanvasWorkflow();
  const enabled = isPreviewConfigReady(data.catalogSlug ?? "polymarket-market", data.values);
  const { preview, loading } = useCanvasNodePreview(workflow?.id, nodeId, enabled);

  if (loading && enabled) {
    return (
      <div className={`${PREVIEW_BOX} px-3 py-2 text-xs font-semibold text-[var(--hero-ink)]/45`}>
        Loading book…
      </div>
    );
  }

  if (preview?.kind === "polymarket_feed" && preview.ready) {
    const rows = [
      ...preview.book.bids.map((r) => ({ p: r.price.toFixed(2), s: r.size.toFixed(0), buy: true })),
      ...preview.book.asks.map((r) => ({ p: r.price.toFixed(2), s: r.size.toFixed(0), buy: false })),
    ].slice(0, 8);
    return (
      <div className={`${PREVIEW_BOX} space-y-0.5 px-3 py-2 font-mono text-xs`}>
        <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-[var(--hero-ink)]/40">
          <span>L2 book</span>
          <span className="text-[var(--hero-mint)]">{preview.connection}</span>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="flex justify-between">
            <span className={r.buy ? "text-[var(--hero-mint)]" : "text-[var(--hero-coral)]"}>{r.p}</span>
            <span className="text-[var(--hero-ink)]/45">{r.s}</span>
          </div>
        ))}
        {preview.last_trade ? (
          <div className="mt-1 border-t border-dashed border-[var(--hero-ink)]/10 pt-1 text-[var(--hero-ink)]/55">
            last {preview.last_trade.price.toFixed(3)}
          </div>
        ) : null}
      </div>
    );
  }

  return <BookPreviewMock />;
}

function BookPreviewMock() {
  const rows = [
    { p: "0.62", s: "1.2k", buy: true },
    { p: "0.61", s: "3.4k", buy: true },
    { p: "0.63", s: "2.1k", buy: false },
    { p: "0.64", s: "0.9k", buy: false },
  ];
  return (
    <div className={`${PREVIEW_BOX} space-y-0.5 px-3 py-2 font-mono text-xs`}>
      {rows.map((r, i) => (
        <div key={i} className="flex justify-between">
          <span className={r.buy ? "text-[var(--hero-mint)]" : "text-[var(--hero-coral)]"}>{r.p}</span>
          <span className="text-[var(--hero-ink)]/45">{r.s}</span>
        </div>
      ))}
    </div>
  );
}

function PolicyGatePreview({ values }: { values: Record<string, ConfigValue> }) {
  const { workflow } = useActiveCanvasWorkflow();
  const mode = String(values.policy_mode ?? "inherit");
  const [policy, setPolicy] = useState<CanvasPolicyDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mode !== "inherit" || !workflow?.id) {
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const detail = await getCanvasWorkflowPolicy(workflow.id);
        if (!cancelled) setPolicy(detail);
      } catch {
        if (!cancelled) setPolicy(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, workflow?.id]);

  if (mode === "override") {
    const cap = values.max_single_action_usd ?? "—";
    const actions = String(values.allowed_actions || "—");
    const approve = values.require_approve === true ? "yes" : "no";
    return (
      <div className={`${PREVIEW_BOX} space-y-1 px-3 py-2 text-xs`}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold uppercase tracking-wide text-[var(--hero-amber)]">Draft override</span>
          <span className="text-[var(--hero-ink)]/45">not enforced in Live</span>
        </div>
        <div className="text-[var(--hero-ink)]/65">
          max action ${String(cap)} · approve {approve}
        </div>
        <div className="truncate font-mono text-[var(--hero-ink)]/50">{actions}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`${PREVIEW_BOX} px-3 py-2 text-xs font-semibold text-[var(--hero-ink)]/45`}>
        Loading workflow policy…
      </div>
    );
  }

  if (!policy) {
    return (
      <div className={`${PREVIEW_BOX} flex items-center justify-between px-3 py-2 text-xs`}>
        <span className="font-bold text-[var(--hero-mint)]">PASS</span>
        <span className="text-[var(--hero-ink)]/45">workflow policy (dry-run)</span>
      </div>
    );
  }

  const denied = policy.kill_switch || policy.kill_switch_active;
  return (
    <div className={`${PREVIEW_BOX} space-y-1 px-3 py-2 text-xs`}>
      <div className="flex items-center justify-between gap-2">
        <span
          className={`font-bold uppercase ${denied ? "text-[var(--hero-coral)]" : "text-[var(--hero-mint)]"}`}
        >
          {denied ? "DENY" : "PASS"}
        </span>
        <span className="text-[var(--hero-ink)]/45">workflow policy</span>
      </div>
      <div className="text-[var(--hero-ink)]/65">
        24h cap ${policy.max_spend_usd_24h} · single ${policy.max_single_action_usd} · spent $
        {policy.spend_usd_24h}
      </div>
      <div className="truncate font-mono text-[var(--hero-ink)]/50">
        {policy.allowed_actions.slice(0, 4).join(", ")}
        {policy.allowed_actions.length > 4 ? "…" : ""}
      </div>
    </div>
  );
}

function PreviewRegion({
  nodeId,
  data,
  catalogSlug,
}: {
  nodeId: string;
  data: RichNodeType["data"];
  catalogSlug?: string;
}) {
  const kind = data.preview;
  if (catalogSlug === "policy-gate" && data.values) {
    return <PolicyGatePreview values={data.values} />;
  }
  if (kind === "none") return null;

  if (kind === "bars") {
    const bars = [40, 62, 48, 75, 55, 82, 68, 90, 72, 60];
    return (
      <div className={`${PREVIEW_BOX} flex h-20 items-end gap-1 px-2 py-1.5`}>
        {bars.map((h, i) => (
          <span key={i} className="flex-1 rounded-sm bg-[var(--hero-blue)]/70" style={{ height: `${h}%` }} />
        ))}
      </div>
    );
  }

  if (kind === "book") {
    return <BookPreviewLive nodeId={nodeId} data={data} />;
  }

  if (kind === "positions") {
    const rows = [
      { m: "BTC > 100k", side: "YES", sz: "$120" },
      { m: "ETH > 4k", side: "NO", sz: "$60" },
    ];
    return (
      <div className={`${PREVIEW_BOX} space-y-0.5 px-3 py-2 text-xs`}>
        {rows.map((r, i) => (
          <div key={i} className="flex justify-between gap-2">
            <span className="truncate font-semibold">{r.m}</span>
            <span className="shrink-0 font-bold text-[var(--hero-ink)]/55">
              {r.side} · {r.sz}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (kind === "result") {
    return (
      <div className={`${PREVIEW_BOX} flex items-center justify-between px-3 py-2`}>
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--hero-ink)]/45">last eval</span>
        <span className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/20 px-2 py-0.5 text-xs font-bold">
          true
        </span>
      </div>
    );
  }

  if (kind === "order") {
    return <OrderPreview values={data.values ?? {}} />;
  }

  if (kind === "copytrade") {
    const v = data.values ?? {};
    const leader = String(v.leader || "leader wallet");
    const pct = String(v.mirror_pct ?? 100);
    const cap = String(v.max_per_trade ?? "—");
    const ai = v.ai_filter === true;
    return (
      <div className={`${PREVIEW_BOX} space-y-1 px-3 py-2 text-xs`}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold uppercase tracking-wide text-[var(--hero-ink)]/45">Leader</span>
          <span className="truncate font-mono text-[var(--hero-ink)]/70">{leader}</span>
        </div>
        <div className="text-[var(--hero-ink)]/55">
          last: <span className="font-bold text-[var(--hero-mint)]">BUY YES</span> $4.2k @ 0.41
        </div>
        <div className="font-semibold text-[var(--hero-ink)]/75">
          ↳ mirror {pct}% · cap ${cap}
          {ai ? " · AI-filtered" : ""}
        </div>
      </div>
    );
  }

  return null;
}

const CONTROL =
  "nodrag rounded-md border-2 border-[var(--hero-ink)]/15 bg-[var(--hero-bg)] px-2 py-1 text-xs font-bold focus:border-[var(--hero-ink)] focus:outline-none";

function FieldControl({
  field,
  value,
  onChange,
  catalogSlug,
  allValues,
  onApplyValues,
  datalistId,
}: {
  field: ConfigField;
  value: ConfigValue;
  onChange: (v: ConfigValue) => void;
  catalogSlug?: string;
  allValues?: Record<string, ConfigValue>;
  onApplyValues?: (patch: Record<string, ConfigValue>) => void;
  datalistId?: string;
}) {
  if (field.kind === "market" && catalogSlug === "polymarket-market" && onApplyValues) {
    return (
      <PolymarketMarketPicker
        key={String(allValues?.market_id ?? value ?? "empty")}
        value={String(value ?? "")}
        outcome={String(allValues?.outcome ?? "yes")}
        placeholder={"placeholder" in field ? field.placeholder : undefined}
        onApply={onApplyValues}
      />
    );
  }
  if (field.kind === "condition") {
    const left = String(allValues?.[field.leftKey] ?? "");
    const op = String(allValues?.[field.opKey] ?? field.defaultOp);
    const right = String(allValues?.[field.rightKey] ?? "");
    const apply = (patch: Record<string, ConfigValue>) => onApplyValues?.(patch);
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          list={datalistId}
          className={`${CONTROL} min-w-0 flex-1`}
          value={left}
          placeholder={field.leftPlaceholder ?? "field"}
          onChange={(e) => apply({ [field.leftKey]: e.target.value })}
        />
        <select
          className={CONTROL}
          value={op}
          onChange={(e) => apply({ [field.opKey]: e.target.value })}
        >
          {field.operators.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          list={datalistId}
          className={`${CONTROL} min-w-0 flex-1`}
          value={right}
          placeholder={field.rightPlaceholder ?? "value"}
          onChange={(e) => apply({ [field.rightKey]: e.target.value })}
        />
      </div>
    );
  }
  if (field.kind === "branches") {
    const rows: BranchRule[] = Array.isArray(value) ? value : [];
    const commit = (next: BranchRule[]) => onChange(next);
    const patchRow = (i: number, patch: Partial<BranchRule>) =>
      commit(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    return (
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div
            key={i}
            className="space-y-1.5 rounded-lg border-2 border-[var(--hero-ink)]/10 bg-white p-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--hero-ink)]/45">
                {i === 0 ? "If" : "Else if"}
              </span>
              {rows.length > 1 ? (
                <button
                  type="button"
                  aria-label="Remove condition"
                  onClick={() => commit(rows.filter((_, j) => j !== i))}
                  className="nodrag text-[var(--hero-ink)]/30 transition-colors hover:text-[var(--hero-coral)]"
                >
                  <X className="size-3" strokeWidth={2.5} />
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                list={datalistId}
                className={`${CONTROL} min-w-0 flex-1`}
                value={row.left}
                placeholder={field.leftPlaceholder ?? "field"}
                onChange={(e) => patchRow(i, { left: e.target.value })}
              />
              <select
                className={CONTROL}
                value={row.op}
                onChange={(e) => patchRow(i, { op: e.target.value })}
              >
                {field.operators.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                list={datalistId}
                className={`${CONTROL} min-w-0 flex-1`}
                value={row.right}
                placeholder={field.rightPlaceholder ?? "value"}
                onChange={(e) => patchRow(i, { right: e.target.value })}
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => commit([...rows, { left: "", op: field.defaultOp, right: "" }])}
          className="nodrag flex w-full items-center justify-center gap-1 rounded-lg border-2 border-dashed border-[var(--hero-ink)]/20 px-2 py-1 text-[11px] font-bold text-[var(--hero-ink)]/55 transition-colors hover:border-[var(--hero-ink)] hover:text-[var(--hero-ink)]"
        >
          <Plus className="size-3" strokeWidth={2.5} />
          {field.addLabel ?? "Add condition"}
        </button>
        <p className="text-[10px] font-medium text-[var(--hero-ink)]/40">
          Else → falls through to the default output.
        </p>
      </div>
    );
  }
  if (field.kind === "select") {
    return (
      <select className={CONTROL} value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.kind === "number") {
    return (
      <span className="flex items-center gap-1">
        <input
          type="number"
          className={`${CONTROL} w-20 text-right`}
          value={value === "" ? "" : Number(value)}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
        {field.suffix ? (
          <span className="text-[10px] font-bold text-[var(--hero-ink)]/40">{field.suffix}</span>
        ) : null}
      </span>
    );
  }
  if (field.kind === "toggle") {
    return (
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`nodrag h-5 w-9 rounded-full border-2 border-[var(--hero-ink)] transition-colors ${
          value ? "bg-[var(--hero-mint)]" : "bg-white"
        }`}
      >
        <span
          className={`block size-3 rounded-full bg-[var(--hero-ink)] transition-transform ${
            value ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    );
  }
  return (
    <input
      type="text"
      list={datalistId}
      className={`${CONTROL} w-full`}
      value={String(value ?? "")}
      placeholder={"placeholder" in field ? field.placeholder : undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function ConfigPanel({
  nodeId,
  fields,
  values,
  catalogSlug,
  suggestions,
}: {
  nodeId: string;
  fields: ConfigField[];
  values: Record<string, ConfigValue>;
  catalogSlug?: string;
  suggestions?: string[];
}) {
  const { updateNodeData } = useReactFlow();
  const applyValues = (patch: Record<string, ConfigValue>) =>
    updateNodeData(nodeId, { values: { ...values, ...patch } });

  const hasSuggestions = Boolean(suggestions && suggestions.length > 0);
  const datalistId = hasSuggestions ? `cfg-paths-${nodeId}` : undefined;

  const setValue = (key: string, v: ConfigValue) => {
    const next: Record<string, ConfigValue> = { ...values, [key]: v };
    if (key === "outcome") {
      const yesToken = String(values.yes_token_id ?? "");
      const noToken = String(values.no_token_id ?? "");
      if (yesToken || noToken) {
        next.asset_id = v === "no" ? noToken : yesToken;
      }
    }
    updateNodeData(nodeId, { values: next });
  };

  const visible = fields.filter((f) => isConfigFieldVisible(f, values));

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--hero-ink)]/35">Configure</p>
      {hasSuggestions ? (
        <datalist id={datalistId}>
          {suggestions!.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
      {visible.map((field) => {
        const value = values[field.key] ?? "";
        const missing =
          field.kind !== "condition" &&
          field.required &&
          field.key !== "_note" &&
          (value === "" || value === undefined);
        if (field.key === "_note") {
          return (
            <p
              key={field.key}
              className="rounded-lg border-2 border-dashed border-[var(--hero-ink)]/15 bg-[var(--hero-bg)] px-3 py-2 text-xs font-semibold text-[var(--hero-ink)]/65"
            >
              {String(("default" in field ? field.default : undefined) ?? value ?? field.label)}
            </p>
          );
        }
        const fullWidth =
          field.kind === "text" ||
          field.kind === "market" ||
          field.kind === "condition" ||
          field.kind === "branches";
        const label = (
          <span className="text-xs font-bold uppercase tracking-wide text-[var(--hero-ink)]/45">
            {field.label}
            {missing ? <span className="text-[var(--hero-coral)]"> *</span> : null}
          </span>
        );
        if (fullWidth) {
          return (
            <div key={field.key} className="space-y-1">
              {label}
              <FieldControl
                field={field}
                value={value}
                onChange={(v) => setValue(field.key, v)}
                catalogSlug={catalogSlug}
                allValues={values}
                onApplyValues={applyValues}
                datalistId={datalistId}
              />
            </div>
          );
        }
        return (
          <label key={field.key} className="flex items-center justify-between gap-3">
            {label}
            <FieldControl
              field={field}
              value={value}
              onChange={(v) => setValue(field.key, v)}
              catalogSlug={catalogSlug}
              allValues={values}
              onApplyValues={applyValues}
              datalistId={datalistId}
            />
          </label>
        );
      })}
    </div>
  );
}

function PaneHeader({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="flex items-center justify-between border-b-2 border-[var(--hero-ink)]/10 px-4 py-3">
      <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--hero-ink)]/45">
        {label}
      </span>
      <span className="text-[10px] font-medium text-[var(--hero-ink)]/35">{sub}</span>
    </div>
  );
}

/** One input/output port — its chip, description, and example payload viewer. */
function PortIOCard({ port, doc }: { port: CanvasPort; doc?: PortDoc }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)]/15 px-2 py-0.5 text-[11px] font-bold">
          <span
            className="size-2.5 rounded-full border border-[var(--hero-ink)]"
            style={{ background: PORT_COLOR[port.kind] }}
          />
          {port.label ?? PORT_LABEL[port.kind]}
        </span>
        <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--hero-ink)]/35">
          {port.kind}
        </span>
      </div>
      {doc?.description ? (
        <p className="text-xs font-medium text-[var(--hero-ink)]/60">{doc.description}</p>
      ) : null}
      <JsonDataView value={doc?.example} emptyLabel="No sample for this port yet." />
    </div>
  );
}

/**
 * Node detail popup (n8n-style): INPUT (data in) · PARAMETERS · OUTPUT
 * (expected result). A centered modal over the canvas — opens on node click.
 */
export function NodeDetailModal({
  node,
  onClose,
  onDelete,
}: {
  node: RichNodeType;
  onClose: () => void;
  onDelete: () => void;
}) {
  const data = node.data;
  const status = getNodeStatus(data);
  const fullBleed = isImageLogo(data.icon);
  const catalogEntry = findCatalogEntryForNode(data);
  const catalogSlug = catalogEntry?.slug ?? data.catalogSlug;
  const portDocs = catalogEntry?.portDocs;
  const hasConfig = Boolean(data.fields?.length && data.values);

  // Field paths from the incoming data (input port examples) → operand dropdown.
  const inputFieldPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const p of data.inputs) {
      for (const path of collectFieldPaths(portDocs?.inputs?.[p.kind]?.example)) {
        paths.add(path);
      }
    }
    return Array.from(paths);
  }, [data.inputs, portDocs]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--hero-ink)]/40"
      />
      <div
        role="dialog"
        aria-label={data.title}
        className="relative flex h-full max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border-2 border-[var(--hero-ink)] bg-[var(--hero-bg)] shadow-2xl"
      >
        {/* Top bar */}
        <div className="flex items-center gap-3 border-b-2 border-[var(--hero-ink)] bg-white px-4 py-2.5">
          <span
          className={`flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-[var(--hero-ink)] ${
            fullBleed ? "" : "bg-white"
          }`}
        >
          <NodeGlyph
            icon={data.icon}
            className={fullBleed ? "h-full w-full object-cover" : "size-5 text-[var(--hero-ink)]"}
          />
        </span>
        <span className="min-w-0 truncate font-heading text-base font-extrabold">{data.title}</span>
        {status.label ? (
          <span
            className={`rounded-full border-2 border-[var(--hero-ink)]/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              status.tone === "warn" || status.tone === "soon"
                ? "bg-[var(--hero-amber)] text-[var(--hero-ink)]"
                : status.tone === "ready"
                  ? "bg-[var(--hero-mint)]/20"
                  : "bg-white"
            }`}
          >
            {status.label}
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--hero-coral)] transition-colors hover:bg-[var(--hero-coral)]/10"
          >
            <Trash2 className="size-3.5" strokeWidth={2.5} />
            Delete
          </button>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg border-2 border-[var(--hero-ink)]/15 transition-colors hover:border-[var(--hero-ink)]"
          >
            <X className="size-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Three panes */}
      <div className="flex min-h-0 flex-1">
        {/* INPUT */}
        <section className="flex w-1/4 min-w-[15rem] flex-col border-r-2 border-[var(--hero-ink)]/15 bg-white">
          <PaneHeader label="Input" sub="data coming in" />
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
            {data.inputs.length > 0 ? (
              data.inputs.map((p, i) => (
                <PortIOCard key={`in-${p.kind}-${i}`} port={p} doc={portDocs?.inputs?.[p.kind]} />
              ))
            ) : (
              <p className="text-xs font-semibold text-[var(--hero-ink)]/40">
                This node has no inputs — it is a starting point.
              </p>
            )}
          </div>
        </section>

        {/* PARAMETERS (center) */}
        <section className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-[var(--hero-bg)]">
          <div className="mx-auto w-full max-w-md space-y-4 p-6">
            <div className="flex items-center gap-3">
              <span
                className={`flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-[var(--hero-ink)] ${
                  fullBleed ? "" : "bg-white"
                }`}
              >
                <NodeGlyph
                  icon={data.icon}
                  className={fullBleed ? "h-full w-full object-cover" : "size-6 text-[var(--hero-ink)]"}
                />
              </span>
              <div className="min-w-0">
                <h2 className="truncate font-heading text-lg font-extrabold">{data.title}</h2>
                {catalogSlug ? (
                  <p className="font-mono text-[11px] font-semibold text-[var(--hero-ink)]/40">
                    {catalogSlug}
                  </p>
                ) : null}
              </div>
            </div>

            {data.comingSoon ? (
              <p className="rounded-lg border-2 border-[var(--hero-amber)]/40 bg-[var(--hero-amber)]/10 px-3 py-2 text-xs font-semibold text-[var(--hero-ink)]/75">
                Trading on this venue is coming soon — config is editable, execution is not yet enabled.
              </p>
            ) : null}

            {data.preview !== "none" || catalogSlug === "policy-gate" ? (
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--hero-ink)]/35">
                  Preview
                </p>
                <PreviewRegion nodeId={node.id} data={data} catalogSlug={catalogSlug} />
              </div>
            ) : null}

            {hasConfig ? (
              <ConfigPanel
                nodeId={node.id}
                fields={data.fields!}
                values={data.values!}
                catalogSlug={catalogSlug}
                suggestions={inputFieldPaths}
              />
            ) : data.config.length > 0 ? (
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--hero-ink)]/35">
                  Configure
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {data.config.map((c) => (
                    <span
                      key={c.label}
                      className="inline-flex items-center gap-1 rounded-md border-2 border-[var(--hero-ink)]/15 bg-white px-1.5 py-0.5 text-xs font-semibold"
                    >
                      <span className="text-[var(--hero-ink)]/40">{c.label}</span>
                      <span className="font-bold">{c.value}</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs font-medium text-[var(--hero-ink)]/45">
                This node has no parameters to configure.
              </p>
            )}
          </div>
        </section>

        {/* OUTPUT */}
        <section className="flex w-1/4 min-w-[15rem] flex-col border-l-2 border-[var(--hero-ink)]/15 bg-white">
          <PaneHeader label="Output" sub="expected result" />
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
            {data.outputs.length > 0 ? (
              data.outputs.map((p, i) => (
                <PortIOCard key={`out-${p.kind}-${i}`} port={p} doc={portDocs?.outputs?.[p.kind]} />
              ))
            ) : (
              <p className="text-xs font-semibold text-[var(--hero-ink)]/40">
                This node produces no output ports.
              </p>
            )}
          </div>
        </section>
        </div>
      </div>
    </div>
  );
}
