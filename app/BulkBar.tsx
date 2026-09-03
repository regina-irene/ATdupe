"use client";
import { useEffect, useState } from "react";

// One field the bulk bar can set. `options` makes it a dropdown, `kind`
// otherwise decides the input.
export type BulkField = {
  id: string;
  label: string;
  kind?: "text" | "number" | "date" | "checkbox" | "select";
  options?: string[];
  // For select fields, whether clearing the value is allowed.
  clearable?: boolean;
};

export function useSelection<T extends string | number>() {
  const [sel, setSel] = useState<T[]>([]);
  const has = (id: T) => sel.indexOf(id) >= 0;
  const toggle = (id: T) => setSel((s) => (s.indexOf(id) >= 0 ? s.filter((x) => x !== id) : [...s, id]));
  // Shift-free "select all" over whatever is currently on screen.
  const setAll = (ids: T[], on: boolean) =>
    setSel((s) => (on ? Array.from(new Set([...s, ...ids])) : s.filter((x) => ids.indexOf(x) < 0)));
  const clear = () => setSel([]);
  return { sel, has, toggle, setAll, clear, count: sel.length, setSel };
}

// The header and row checkboxes, so every table gets the same control.
export function SelectAllTh({ ids, sel, setAll }: { ids: (string | number)[]; sel: (string | number)[]; setAll: (ids: any[], on: boolean) => void }) {
  const on = ids.length > 0 && ids.every((i) => sel.indexOf(i) >= 0);
  const some = !on && ids.some((i) => sel.indexOf(i) >= 0);
  return (
    <th className="noprint pickcell" style={{ width: 34 }} title={on ? "Clear this page" : "Select everything on this page"}>
      <input type="checkbox" checked={on} ref={(el) => { if (el) el.indeterminate = some; }}
        onChange={(e) => setAll(ids, e.target.checked)} />
    </th>
  );
}

export function SelectTd({ id, has, toggle }: { id: any; has: (id: any) => boolean; toggle: (id: any) => void }) {
  return (
    <td className="noprint pickcell">
      <input type="checkbox" checked={has(id)} onChange={() => toggle(id)} />
    </td>
  );
}

// Sits above the table once something is ticked. One field, one value, applied
// to every selected row.
export default function BulkBar({
  count, fields, onApply, onClear, onDelete, busy, noun = "rows",
}: {
  count: number;
  fields: BulkField[];
  onApply: (fieldId: string, value: any) => Promise<void> | void;
  onClear: () => void;
  onDelete?: () => Promise<void> | void;
  busy?: boolean;
  noun?: string;
}) {
  const [fieldId, setFieldId] = useState(fields[0]?.id || "");
  const [value, setValue] = useState<any>("");

  // Changing which field is being set should not carry the old value over.
  useEffect(() => { setValue(""); }, [fieldId]);
  useEffect(() => { if (fields.length && !fields.some((f) => f.id === fieldId)) setFieldId(fields[0].id); }, [fields, fieldId]);

  if (count === 0) return null;
  const f = fields.find((x) => x.id === fieldId);
  const kind = f?.options ? "select" : f?.kind || "text";
  const ready = kind === "checkbox" ? value !== "" : String(value).trim() !== "" || !!f?.clearable;

  return (
    <div className="bulkbar noprint">
      <b>{count} {count === 1 ? noun.replace(/s$/, "") : noun} selected</b>
      <span className="sep" />
      <label className="f">Set</label>
      <select value={fieldId} onChange={(e) => setFieldId(e.target.value)} style={{ width: 150 }}>
        {fields.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
      </select>
      <label className="f">to</label>
      {kind === "select" ? (
        <select value={value} onChange={(e) => setValue(e.target.value)} style={{ minWidth: 170 }}>
          <option value="">{f?.clearable ? "(clear it)" : "Pick a value..."}</option>
          {(f?.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : kind === "checkbox" ? (
        <select value={value} onChange={(e) => setValue(e.target.value)} style={{ width: 100 }}>
          <option value="">Pick...</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      ) : (
        <input type={kind} value={value} step={kind === "number" ? "0.01" : undefined}
          placeholder={f?.label} onChange={(e) => setValue(e.target.value)} style={{ width: kind === "date" ? 150 : 200 }} />
      )}
      <button className="btn primary sm" disabled={!ready || !!busy}
        onClick={() => onApply(fieldId, kind === "checkbox" ? value === "yes" : value)}>
        {busy ? "Applying..." : "Apply to " + count}
      </button>
      <div className="spacer" />
      {onDelete ? <button className="btn danger sm" disabled={!!busy} onClick={() => onDelete()}>Delete {count}</button> : null}
      <button className="btn ghost sm" onClick={onClear}>Clear selection</button>
    </div>
  );
}
