"use client";

import { X, Trash2 } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import {
  getNodeStatus,
  isConfigFieldVisible,
  PORT_COLOR,
  PORT_LABEL,
  type ConfigField,
  type ConfigValue,
  type RichNode as RichNodeType,
} from "./canvas-nodes";
import { NodeGlyph, isImageLogo } from "./node-glyph";

const PREVIEW_BOX =
  "rounded-lg border-2 border-dashed border-[var(--hero-ink)]/15 bg-[var(--hero-bg)]";

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

function PreviewRegion({ data }: { data: RichNodeType["data"] }) {
  const kind = data.preview;
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
}: {
  field: ConfigField;
  value: ConfigValue;
  onChange: (v: ConfigValue) => void;
}) {
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
}: {
  nodeId: string;
  fields: ConfigField[];
  values: Record<string, ConfigValue>;
}) {
  const { updateNodeData } = useReactFlow();
  const setValue = (key: string, v: ConfigValue) =>
    updateNodeData(nodeId, { values: { ...values, [key]: v } });

  const visible = fields.filter((f) => isConfigFieldVisible(f, values));

  return (
    <div className="space-y-2">
      {visible.map((field) => {
        const value = values[field.key] ?? "";
        const missing = field.required && (value === "" || value === undefined);
        const fullWidth = field.kind === "text" || field.kind === "market";
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
              <FieldControl field={field} value={value} onChange={(v) => setValue(field.key, v)} />
            </div>
          );
        }
        return (
          <label key={field.key} className="flex items-center justify-between gap-3">
            {label}
            <FieldControl field={field} value={value} onChange={(v) => setValue(field.key, v)} />
          </label>
        );
      })}
    </div>
  );
}

function PortList({ title, ports }: { title: string; ports: RichNodeType["data"]["inputs"] }) {
  if (ports.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--hero-ink)]/35">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {ports.map((p, i) => (
          <span
            key={`${p.kind}-${i}`}
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)]/15 px-2 py-0.5 text-[11px] font-bold"
          >
            <span
              className="size-2.5 rounded-full border border-[var(--hero-ink)]"
              style={{ background: PORT_COLOR[p.kind] }}
            />
            {p.label ?? PORT_LABEL[p.kind]}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Center dialog showing a node's full detail — opens when a node is clicked. */
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

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-6">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[var(--hero-ink)]/25" />

      <div
        role="dialog"
        aria-label={data.title}
        className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border-2 border-[var(--hero-ink)] bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b-2 border-[var(--hero-ink)] px-4 py-3">
          <span
            className={`flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-[var(--hero-ink)] ${
              fullBleed ? "" : "bg-white"
            }`}
          >
            <NodeGlyph
              icon={data.icon}
              className={fullBleed ? "h-full w-full object-cover" : "size-5 text-[var(--hero-ink)]"}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-heading text-base font-extrabold">{data.title}</span>
          </span>
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
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-lg border-2 border-[var(--hero-ink)]/15 transition-colors hover:border-[var(--hero-ink)]"
          >
            <X className="size-4" strokeWidth={2.5} />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {data.comingSoon ? (
            <p className="rounded-lg border-2 border-[var(--hero-amber)]/40 bg-[var(--hero-amber)]/10 px-3 py-2 text-xs font-semibold text-[var(--hero-ink)]/75">
              Trading on this venue is coming soon — config is editable, execution is not yet enabled.
            </p>
          ) : null}

          {data.preview !== "none" ? (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--hero-ink)]/35">
                Preview
              </p>
              <PreviewRegion data={data} />
            </div>
          ) : null}

          {data.fields && data.values ? (
            <ConfigPanel nodeId={node.id} fields={data.fields} values={data.values} />
          ) : data.config.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {data.config.map((c) => (
                <span
                  key={c.label}
                  className="inline-flex items-center gap-1 rounded-md border-2 border-[var(--hero-ink)]/15 bg-[var(--hero-bg)] px-1.5 py-0.5 text-xs font-semibold"
                >
                  <span className="text-[var(--hero-ink)]/40">{c.label}</span>
                  <span className="font-bold">{c.value}</span>
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 border-t-2 border-dashed border-[var(--hero-ink)]/15 pt-3">
            <PortList title="Inputs" ports={data.inputs} />
            <PortList title="Outputs" ports={data.outputs} />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t-2 border-[var(--hero-ink)] px-4 py-3">
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--hero-ink)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--hero-coral)] transition-colors hover:bg-[var(--hero-coral)]/10"
          >
            <Trash2 className="size-3.5" strokeWidth={2.5} />
            Delete node
          </button>
        </div>
      </div>
    </div>
  );
}
