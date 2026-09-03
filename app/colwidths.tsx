"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";

// Drag the right edge of a heading to set its width. Saved per board on
// this computer, alongside the column order.
export function useColWidths(key: string) {
  const [widths, setWidths] = useState<Record<string, number>>({});
  const drag = useRef<{ id: string; x: number; w: number } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setWidths(JSON.parse(raw) || {});
    } catch {}
  }, [key]);

  const store = useCallback((v: Record<string, number>) => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  }, [key]);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      const w = Math.max(48, Math.round(d.w + (e.clientX - d.x)));
      setWidths((cur) => ({ ...cur, [d.id]: w }));
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      document.body.classList.remove("resizing");
      setWidths((cur) => { store(cur); return cur; });
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
  }, [store]);

  function start(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).closest("th") as HTMLElement | null;
    drag.current = { id, x: e.clientX, w: th?.offsetWidth || 120 };
    document.body.classList.add("resizing");
  }

  function reset() { setWidths({}); store({}); }

  // Double-click a divider to put that one column back to its built-in width,
  // without clearing the whole layout.
  function clearOne(id: string) {
    setWidths((cur) => { const next = { ...cur }; delete next[id]; store(next); return next; });
  }

  // A width for this column: yours if set, otherwise the built-in one.
  function widthOf(id: string, fallback?: number) {
    const w = widths[id];
    return w ? { width: w } : fallback ? { width: fallback } : undefined;
  }

  return { widths, start, reset, clearOne, widthOf, sized: Object.keys(widths).length > 0 };
}

export function Resizer({ onDown, onReset }: { onDown: (e: React.MouseEvent) => void; onReset?: () => void }) {
  return (
    <span className="resizer" title="Drag to set this column's width. Double-click to put it back."
      onMouseDown={onDown} onClick={(e) => e.stopPropagation()} draggable={false}
      onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); onReset?.(); }} />
  );
}
