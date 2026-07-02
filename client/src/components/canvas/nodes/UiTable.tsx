"use client";

/** UI Table node — tabular bind from upstream array payload (Phase 3 stub). */
export function UiTableNode({ rows }: { rows?: Array<Record<string, unknown>> }) {
  const data = rows ?? [];
  if (data.length === 0) {
    return (
      <p className="text-[11px] font-medium text-[var(--hero-ink)]/45">No rows bound</p>
    );
  }

  const keys = Object.keys(data[0] ?? {});

  return (
    <div className="overflow-x-auto rounded-lg border-2 border-[var(--hero-ink)]/15">
      <table className="w-full text-left text-[11px]">
        <thead>
          <tr className="border-b border-[var(--hero-ink)]/10 bg-[var(--hero-bg)]">
            {keys.map((k) => (
              <th key={k} className="px-2 py-1 font-bold uppercase tracking-wide">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 5).map((row, i) => (
            <tr key={i} className="border-b border-[var(--hero-ink)]/5">
              {keys.map((k) => (
                <td key={k} className="px-2 py-1 font-mono">
                  {String(row[k] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
