"use client";
import { useEffect, useState } from "react";

export type ChoiceColors = Record<string, Record<string, string>>;
export type ChoiceMeta = {
  colors: ChoiceColors;
  opts: Record<string, string[]>;
  names: Record<string, string>;
};

const EMPTY: ChoiceMeta = { colors: {}, opts: {}, names: {} };

// One request per browser session, shared by every chip and dropdown, so a
// page with four boards on it does not fetch the schema four times.
let cache: ChoiceMeta | null = null;
let inflight: Promise<ChoiceMeta> | null = null;

function load(): Promise<ChoiceMeta> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/choices")
      .then((r) => r.json())
      .then((j) => {
        cache = { colors: j?.colors || {}, opts: j?.opts || {}, names: j?.names || {} };
        return cache;
      })
      .catch(() => EMPTY)
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function useChoiceMeta(): ChoiceMeta {
  const [meta, setMeta] = useState<ChoiceMeta>(cache || EMPTY);
  useEffect(() => { let live = true; load().then((m) => { if (live) setMeta(m); }); return () => { live = false; }; }, []);
  return meta;
}

export function useChoices(): ChoiceColors {
  return useChoiceMeta().colors;
}

// Every option Airtable offers for one select field, in Airtable's order.
// `fallback` covers the case where the token cannot read the base schema, so
// the dropdowns still work rather than coming up empty.
export function useOptions(fieldId: string, fallback: string[] = []): string[] {
  const { opts } = useChoiceMeta();
  const live = opts[fieldId];
  if (!live || !live.length) return fallback;
  // Keep anything the fallback knows about but Airtable no longer offers, so
  // an older record's value is still selectable rather than silently dropped.
  const extra = fallback.filter((f) => live.indexOf(f) < 0);
  return live.concat(extra);
}

// Renders a select value as an Airtable-coloured pill. Comma separated values
// (a task assigned to two people, say) become one pill each.
// Airtable's own colour for this value. Matching is forgiving, because a stored
// value and the choice name can differ by case or a stray space.
function colourFor(colors: Record<string, string> | undefined, value: string): string {
  if (!colors) return "";
  if (colors[value]) return colors[value];
  const want = value.trim().toLowerCase();
  for (const k of Object.keys(colors)) {
    if (k.trim().toLowerCase() === want) return colors[k];
  }
  return "";
}

export default function Chip({ v, colors, dash = true }: { v?: any; colors?: Record<string, string>; dash?: boolean }) {
  if (v === null || v === undefined || String(v).trim() === "")
    return dash ? <span className="muted">-</span> : null;
  const parts = String(v).split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        const c = colourFor(colors, p);
        return <span key={p + i} className={"tag" + (c ? " sel-" + c : "")} title={p}>{p}</span>;
      })}
    </>
  );
}
