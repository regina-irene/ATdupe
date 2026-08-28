import { NextResponse } from "next/server";
import { ensureSchema, getState, setState } from "../../../lib/db";
import { authorize } from "../../../lib/auth";
import { at, BASE } from "../../../lib/airtable";
import { CHOICE_FIELDS } from "../../../lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = "choice_colors";
const AT_KEY = "choice_colors_at";
const MAX_AGE = 6 * 60 * 60 * 1000;

// Mirrors Airtable's select colours so a status looks the same in both places.
// Needs schema.bases:read on the token; without it the boards fall back to
// plain chips rather than breaking.
async function fetchColors() {
  const j = await at("meta/bases/" + BASE + "/tables");
  const out: Record<string, Record<string, string>> = {};
  for (const t of j.tables || []) {
    for (const f of t.fields || []) {
      if (CHOICE_FIELDS.indexOf(f.id) < 0) continue;
      const choices = f.options?.choices || [];
      const map: Record<string, string> = {};
      for (const c of choices) if (c?.name) map[c.name] = c.color || "";
      out[f.id] = map;
    }
  }
  return out;
}

export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ colors: {} }, { status: 401 });
  try {
    await ensureSchema();
    const force = new URL(req.url).searchParams.get("refresh") === "1";
    const cached = await getState(KEY);
    const cachedAt = Number((await getState(AT_KEY)) || 0);
    if (!force && cached && Date.now() - cachedAt < MAX_AGE) {
      return NextResponse.json({ colors: JSON.parse(cached), cached: true });
    }
    const colors = await fetchColors();
    await setState(KEY, JSON.stringify(colors));
    await setState(AT_KEY, String(Date.now()));
    return NextResponse.json({ colors, cached: false });
  } catch (e: any) {
    // Serve whatever was cached before, so a scope problem degrades quietly.
    try {
      const cached = await getState(KEY);
      if (cached) return NextResponse.json({ colors: JSON.parse(cached), stale: true, note: e.message });
    } catch {}
    return NextResponse.json({ colors: {}, note: e.message });
  }
}
