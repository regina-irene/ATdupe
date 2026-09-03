"use client";
import { useEffect, useState } from "react";

// The one search box that sits above every table. Typing is debounced so a
// long word does not fire a query per keystroke, and Escape clears it.
export default function SearchBar({
  value, onChange, placeholder = "Search this table...", total, hint,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  total?: number;
  hint?: string;
}) {
  const [text, setText] = useState(value);

  // Keep in step when a saved view or a filter reset changes the term.
  useEffect(() => { setText(value); }, [value]);

  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onChange(text), 260);
    return () => clearTimeout(t);
  }, [text]);

  return (
    <div className="searchbar noprint">
      <span className="mag" aria-hidden="true">⌕</span>
      <input type="search" value={text} placeholder={placeholder} spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") { setText(""); onChange(""); } }} />
      {text ? <button className="btn ghost sm" onClick={() => { setText(""); onChange(""); }}>Clear</button> : null}
      {text && total !== undefined
        ? <span className="muted small">{total.toLocaleString()} {total === 1 ? "match" : "matches"}</span>
        : <span className="muted small">{hint || "Every word has to appear. Esc clears."}</span>}
    </div>
  );
}
