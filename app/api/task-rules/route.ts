import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../lib/db";
import { authorize } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const RULE_FIELDS = ["status", "priority", "who", "closed"] as const;

export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const rows = await q("select * from task_rules order by pos nulls last, id");
    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const s = await authorize(req);
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const b = await req.json();
    const ok = (f: any) => RULE_FIELDS.indexOf(f) >= 0;
    if (!ok(b.when_field) || !ok(b.then_field))
      return NextResponse.json({ error: "Rules work on status, priority, who and done." }, { status: 400 });
    if (!String(b.when_value || "").trim())
      return NextResponse.json({ error: "Say what the rule should look for." }, { status: 400 });
    if (b.when_field === b.then_field)
      return NextResponse.json({ error: "A rule cannot change the same field it watches." }, { status: 400 });
    const rows = await q(
      `insert into task_rules (when_field, when_value, then_field, then_value, created_by, pos)
       values ($1,$2,$3,$4,$5,(select coalesce(max(pos),0)+1 from task_rules)) returning *`,
      [b.when_field, String(b.when_value), b.then_field, b.then_value ?? null, s.email || null]);
    return NextResponse.json({ ok: true, rule: rows[0] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
