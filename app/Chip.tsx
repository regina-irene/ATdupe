"use client";
import { useEffect, useState } from "react";

export type ChoiceColors = Record<string, Record<string, string>>;

// One fetch per page load, shared by every chip on it.
export function useChoices(): ChoiceColors {
  const [colors, setColors] = useState<ChoiceColors>({});
  useEffect(() => {
    fetch("/api/choices").then((r) => r.json()).then((j) => { if (j?.colors) setColors(j.colors); }).catch(() => {});
  }, []);
  return colors;
}

// Renders a select value as an Airtable-coloured pill. Comma separated values
// (a task assigned to two people, say) become one pill each.
export default function Chip({ v, colors, dash = true }: { v?: any; colors?: Record<string, string>; dash?: boolean }) {
  if (v === null || v === undefined || String(v).trim() === "")
    return dash ? <span className="muted">-</span> : null;
  const parts = String(v).split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        const c = colors ? colors[p] : "";
        return <span key={p + i} className={"tag" + (c ? " sel-" + c : "")}>{p}</span>;
      })}
    </>
  );
}
