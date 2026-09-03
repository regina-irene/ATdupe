import { NextResponse } from "next/server";
import { ensureSchema, getState, setState } from "../../../lib/db";
import { authorize } from "../../../lib/auth";
import { at, BASE } from "../../../lib/airtable";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = "choice_meta";
const AT_KEY = "choice_colors_at";
const MAX_AGE = 15 * 60 * 1000;

type Meta = {
  // fieldId -> choice name -> Airtable colour token
  colors: Record<string, Record<string, string>>;
  // fieldId -> every choice name, in Airtable's own order
  opts: Record<string, string[]>;
  // fieldId -> field name, handy for diagnosing a wrong id
  names: Record<string, string>;
};

// Mirrors Airtable's select choices so a value looks the same in both places
// and every option Airtable offers appears in the dropdowns here. Every select
// field in the base is read, not a hand-kept list, so adding a choice in
// Airtable is enough. Needs schema.bases:read on the token; without it the
// boards fall back to plain chips and the built-in option lists.
async function fetchMeta(): Promise<Meta> {
  const j = await at("meta/bases/" + BASE + "/tables");
  const colors: Record<string, Record<string, string>> = {};
  const opts: Record<string, string[]> = {};
  const names: Record<string, string> = {};
  for (const t of j.tables || []) {
    for (const f of t.fields || []) {
      if (f.type !== "singleSelect" && f.type !== "multipleSelects") continue;
      const choices = f.options?.choices || [];
      if (!choices.length) continue;
      const map: Record<string, string> = {};
      const list: string[] = [];
      for (const c of choices) {
        if (!c?.name) continue;
        map[c.name] = c.color || "";
        list.push(c.name);
      }
      colors[f.id] = map;
      opts[f.id] = list;
      names[f.id] = f.name || "";
    }
  }
  return { colors, opts, names };
}

const EMPTY: Meta = { colors: {}, opts: {}, names: {} };

// Tolerates the older cache shape, which held only the colours map.
function parse(raw: string): Meta {
  const j = JSON.parse(raw);
  if (j && j.colors) return { colors: j.colors || {}, opts: j.opts || {}, names: j.names || {} };
  return { colors: j || {}, opts: {}, names: {} };
}

export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json(EMPTY, { status: 401 });
  try {
    await ensureSchema();
    const force = new URL(req.url).searchParams.get("refresh") === "1";
    const cached = await getState(KEY);
    const cachedAt = Number((await getState(AT_KEY)) || 0);
    if (!force && cached && Date.now() - cachedAt < MAX_AGE) {
      return NextResponse.json({ ...parse(cached), cached: true });
    }
    const meta = await fetchMeta();
    await setState(KEY, JSON.stringify(meta));
    await setState(AT_KEY, String(Date.now()));
    const fields = Object.keys(meta.colors).length;
    return NextResponse.json({
      ...meta, cached: false, ok: true, fields,
      choices: Object.values(meta.colors).reduce((n: number, m: any) => n + Object.keys(m).length, 0),
    });
  } catch (e: any) {
    // Serve whatever was cached before, so a scope problem degrades quietly.
    try {
      const cached = await getState(KEY);
      if (cached) return NextResponse.json({ ...parse(cached), stale: true, ok: false, note: e.message });
    } catch {}
    // Almost always the token missing schema.bases:read.
    const hint = /403|not authorized|invalid permissions|scope/i.test(String(e.message))
      ? "The Airtable token cannot read the base schema. Add the schema.bases:read scope to it at airtable.com/create/tokens, then refresh."
      : e.message;
    return NextResponse.json({ ...EMPTY, ok: false, note: hint });
  }
}
