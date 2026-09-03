import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELDS = ["client_name","case_name","task","status","priority","who","ord","closed","due_date","link","duration"];

// Same rule engine as the single-row edit, so an automation fires whether one
// task or thirty were changed. The rules only look at the patch, so they are
// evaluated once for the whole batch.
async function applyRules(patch: Record<string, any>) {
  const fired: string[] = [];
  let rules: any[] = [];
  try { rules = await q("select * from task_rules where active = true order by pos nulls last, id"); }
  catch { return { patch, fired }; }

  const touched = new Set(Object.keys(patch));
  for (const r of rules) {
    if (!touched.has(r.when_field)) continue;
    const now = patch[r.when_field];
    const want = r.when_value;
    const hit = r.when_field === "closed"
      ? String(!!now) === String(want === "true" || want === true)
      : String(now ?? "").trim().toLowerCase() === String(want).trim().toLowerCase();
    if (!hit) continue;
    if (touched.has(r.then_field)) continue;
    patch[r.then_field] = r.then_field === "closed"
      ? (r.then_value === "true" || r.then_value === true)
      : (r.then_value ?? null);
    fired.push(`${r.when_field} is ${r.when_value}, so ${r.then_field} became ${r.then_value ?? "empty"}`);
  }
  return { patch, fired };
}

function ids(b: any): number[] {
  const raw = Array.isArray(b?.ids) ? b.ids : [];
  const out: number[] = [];
  for (const v of raw) {
    const n = parseInt(String(v), 10);
    if (Number.isFinite(n) && out.indexOf(n) < 0) out.push(n);
  }
  return out;
}

export async function PATCH(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const b = await req.json();
    const list = ids(b);
    if (!list.length) return NextResponse.json({ error: "Nothing was selected" }, { status: 400 });
    if (list.length > 500) return NextResponse.json({ error: "Too many rows at once. Keep it under 500." }, { status: 400 });

    const src = b?.patch && typeof b.patch === "object" ? b.patch : {};
    const raw: Record<string, any> = {};
    for (const f of FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(src, f)) continue;
      let v = src[f];
      if ((f === "due_date" || f === "ord" || f === "duration") && (v === "" || v === undefined)) v = null;
      if ((f === "status" || f === "priority" || f === "who" || f === "case_name" || f === "client_name") && v === "") v = null;
      raw[f] = v;
    }
    if (!Object.keys(raw).length) return NextResponse.json({ error: "Pick a field and a value first" }, { status: 400 });

    const { patch, fired } = b.skipRules ? { patch: raw, fired: [] as string[] } : await applyRules(raw);

    const sets: string[] = [];
    const params: any[] = [];
    for (const [f, v] of Object.entries(patch)) {
      if (FIELDS.indexOf(f) < 0) continue;
      params.push(v);
      sets.push(f + " = $" + params.length);
    }
    params.push(list);
    const r = await q(
      `update tasks set ${sets.join(", ")}, updated_at = now()
         where id = any($${params.length}::int[]) returning id`,
      params
    );
    return NextResponse.json({ ok: true, updated: r.length, applied: patch, fired });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const list = ids(await req.json());
    if (!list.length) return NextResponse.json({ error: "Nothing was selected" }, { status: 400 });
    const r = await q("delete from tasks where id = any($1::int[]) returning id", [list]);
    return NextResponse.json({ ok: true, deleted: r.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
