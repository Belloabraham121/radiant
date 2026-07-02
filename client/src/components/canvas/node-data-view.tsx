"use client";

import { useState } from "react";

type Tab = "schema" | "table" | "json";

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function fmt(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function SchemaTree({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const t = typeOf(value);

  if (t === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <div className={depth > 0 ? "ml-2 border-l-2 border-[var(--hero-ink)]/10 pl-2" : ""}>
        {entries.map(([k, v]) => {
          const vt = typeOf(v);
          return (
            <div key={k} className="py-0.5">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xs font-bold">{k}</span>
                <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--hero-ink)]/35">
                  {vt === "array" ? `array(${(v as unknown[]).length})` : vt}
                </span>
                {vt !== "object" && vt !== "array" ? (
                  <span className="truncate font-mono text-[11px] text-[var(--hero-ink)]/55">{fmt(v)}</span>
                ) : null}
              </div>
              {vt === "object" ? <SchemaTree value={v} depth={depth + 1} /> : null}
              {vt === "array" && (v as unknown[]).length > 0 ? (
                <SchemaTree value={(v as unknown[])[0]} depth={depth + 1} />
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  if (t === "array") {
    const arr = value as unknown[];
    return (
      <div>
        <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--hero-ink)]/35">
          array({arr.length})
        </span>
        {arr.length > 0 ? <SchemaTree value={arr[0]} depth={depth + 1} /> : null}
      </div>
    );
  }

  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--hero-ink)]/35">{t}</span>
      <span className="font-mono text-[11px] text-[var(--hero-ink)]/55">{fmt(value)}</span>
    </div>
  );
}

const CELL = "border border-[var(--hero-ink)]/10 px-2 py-1 text-left align-top";

function TableView({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    const rows = value as unknown[];
    if (rows.length > 0 && typeof rows[0] === "object" && rows[0] !== null && !Array.isArray(rows[0])) {
      const cols = Array.from(
        new Set(rows.flatMap((r) => Object.keys(r as Record<string, unknown>))),
      );
      return (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} className={`${CELL} bg-[var(--hero-bg)] font-bold`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c} className={`${CELL} font-mono`}>
                    {fmt((r as Record<string, unknown>)[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    return (
      <table className="w-full border-collapse text-xs">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className={`${CELL} bg-[var(--hero-bg)] font-bold`}>{i}</td>
              <td className={`${CELL} font-mono`}>{fmt(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (value && typeof value === "object") {
    return (
      <table className="w-full border-collapse text-xs">
        <tbody>
          {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
            <tr key={k}>
              <td className={`${CELL} bg-[var(--hero-bg)] font-bold`}>{k}</td>
              <td className={`${CELL} font-mono`}>{fmt(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return <p className="font-mono text-xs text-[var(--hero-ink)]/70">{fmt(value)}</p>;
}

/** Schema | Table | JSON viewer over any payload — used by the INPUT/OUTPUT panes. */
export function JsonDataView({
  value,
  emptyLabel = "No data yet — run the workflow to see values.",
}: {
  value: unknown;
  emptyLabel?: string;
}) {
  const [tab, setTab] = useState<Tab>("schema");
  const empty = value === undefined || value === null;

  return (
    <div className="overflow-hidden rounded-lg border-2 border-[var(--hero-ink)]/10 bg-white">
      <div className="flex items-center gap-1 border-b-2 border-[var(--hero-ink)]/10 bg-[var(--hero-bg)] px-2 py-1">
        {(["schema", "table", "json"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
              tab === t
                ? "bg-[var(--hero-ink)] text-[var(--hero-bg)]"
                : "text-[var(--hero-ink)]/45 hover:text-[var(--hero-ink)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="max-h-64 overflow-auto p-2.5">
        {empty ? (
          <p className="text-xs font-semibold text-[var(--hero-ink)]/40">{emptyLabel}</p>
        ) : tab === "schema" ? (
          <SchemaTree value={value} />
        ) : tab === "table" ? (
          <TableView value={value} />
        ) : (
          <pre className="font-mono text-[10px] leading-relaxed text-[var(--hero-ink)]/75">
            {JSON.stringify(value, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
