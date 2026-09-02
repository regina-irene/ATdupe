import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELDS = ["client_name","case_name","task","status","priority","who","ord","closed","due_date","link","duration"];

// Rules run here rather than in the page, so they apply however the change was
// made: inline, from the panel, or from an outside call.
async function applyRules(patch: Record<string, any>) {
  const fired: string[] = [];
  let rules: any[] = [];
  try { rules = await q("select * from task_rules where active = true order by pos nulls last, id"); }
  catch { return { patch, fired }; }

  const touched = new Set(Object.keys(patch));
  for (const r of rules) {
    if (!touched.has(r.when_field)) continue;               // only on a field just changed
    const now = patch[r.when_field];
    const want = r.when_value;
    const hit = r.when_field === "closed"
      ? String(!!now) === String(want === "true" || want === true)
      : String(now ?? "").trim().toLowerCase() === String(want).trim().toLowerCase();
    if (!hit) continue;
    // Anything set by hand in the same edit wins over the rule.
    if (touched.has(r.then_field)) continue;
    patch[r.then_field] = r.then_field === "closed"
      ? (r.then_value === "true" || r.then_value === true)
      : (r.then_value ?? null);
    fired.push(`${r.when_field} is ${r.when_value}, so ${r.then_field} became ${r.then_value ?? "empty"}`);
  }
  return { patch, fired };
}

export async function PATCH(req: Request, ctx: any) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const p = await ctx.params;
    const b = await req.json();
    const raw: Record<string, any> = {};
    for (const f of FIELDS) {
      if (Object.prototype.hasOwnProperty.call(b, f)) {
        let v = b[f];
        if ((f === "due_date" || f === "ord" || f === "duration") && (v === "" || v === undefined)) v = null;
        raw[f] = v;
      }
    }
    if (!Object.keys(raw).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    const { patch, fired } = b.skipRules ? { patch: raw, fired: [] as string[] } : await applyRules(raw);

    const sets: string[] = [];
    const params: any[] = [];
    for (const [f, v] of Object.entries(patch)) {
      if (FIELDS.indexOf(f) < 0) continue;
      params.push(v);
      sets.push(f + " = $" + params.length);
    }
    params.push(parseInt(p.id, 10));
    await q(`update tasks set ${sets.join(", ")}, updated_at = now() where id = $${params.length}`, params);
    return NextResponse.json({ ok: true, applied: patch, fired });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: any) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const p = await ctx.params;
    await q("delete from tasks where id = $1", [parseInt(p.id, 10)]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
