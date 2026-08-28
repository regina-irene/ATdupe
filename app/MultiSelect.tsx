"use client";
import { useEffect, useRef, useState } from "react";

// Checkbox dropdown for filters with many choices, e.g. the 36 task statuses.
export default function MultiSelect({
  label, options, value, onChange, allLabel = "All",
}: {
  label: string;
  options: (string | number)[];
  value: string[];
  onChange: (v: string[]) => void;
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const all = options.map((o) => String(o));
  const shown = term ? all.filter((o) => o.toLowerCase().indexOf(term.toLowerCase()) >= 0) : all;
  const set = (next: string[]) => onChange(Array.from(new Set(next)).sort());
  const toggle = (o: string) => set(value.indexOf(o) >= 0 ? value.filter((v) => v !== o) : [...value, o]);

  const summary =
    value.length === 0 ? allLabel :
    value.length === 1 ? value[0] :
    value.length === all.length ? "All " + all.length + " selected" :
    value.length + " selected";

  return (
    <div className="ms" ref={box}>
      <label className="f">{label}</label>
      <button type="button" className={"msbtn" + (value.length ? " on" : "")}
              onClick={() => setOpen(!open)} title={value.length ? value.join(", ") : allLabel}>
        <span className="mstext">{summary}</span>
        <span className="mscaret">▾</span>
      </button>
      {open ? (
        <div className="mspanel">
          {all.length > 8 ? (
            <input type="search" autoFocus placeholder="Find..." value={term} onChange={(e) => setTerm(e.target.value)} />
          ) : null}
          <div className="msrow">
            <button type="button" className="btn ghost sm" onClick={() => set([...value, ...shown])}>
              {term ? "Select these" : "Select all"}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => onChange([])}>Clear</button>
            <div className="spacer" />
            <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>Done</button>
          </div>
          <div className="mslist">
            {shown.length === 0 ? <div className="muted small" style={{ padding: "7px 9px" }}>Nothing matches.</div> : null}
            {shown.map((o) => (
              <label key={o} className="msitem">
                <input type="checkbox" checked={value.indexOf(o) >= 0} onChange={() => toggle(o)} />
                <span>{o}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
