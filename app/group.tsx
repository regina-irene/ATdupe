"use client";
import { Fragment, ReactNode } from "react";

export type GroupDef = { id: string; label: string; keyOf: (r: any) => string };

// Grouping runs over the rows currently loaded, so raising Rows per page
// widens what a group covers.
export function buildGroups(rows: any[], def?: GroupDef | null): { key: string; items: any[] }[] {
  if (!def) return [{ key: "", items: rows }];
  const m = new Map<string, any[]>();
  for (const r of rows) {
    const k = String(def.keyOf(r) ?? "").trim() || "(blank)";
    const cur = m.get(k);
    if (cur) cur.push(r); else m.set(k, [r]);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: "base" }))
    .map(([key, items]) => ({ key, items }));
}

export function GroupPicker({ defs, value, onChange }: { defs: GroupDef[]; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 170 }} title="Group the rows">
      <option value="">No grouping</option>
      {defs.map((d) => <option key={d.id} value={d.id}>Group by {d.label}</option>)}
    </select>
  );
}

export function GroupRow({ label, count, extra, collapsed, onToggle, span }: {
  label: string; count: number; extra?: ReactNode; collapsed: boolean; onToggle: () => void; span: number;
}) {
  return (
    <tr className="grouprow">
      <td colSpan={span} onClick={onToggle}>
        <button className="twist">{collapsed ? "▸" : "▾"}</button>
        <b>{label}</b> <span className="muted small">({count.toLocaleString()})</span>
        {extra ? <span className="groupextra">{extra}</span> : null}
      </td>
    </tr>
  );
}

export { Fragment };
