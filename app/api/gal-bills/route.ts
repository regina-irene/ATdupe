import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../lib/db";
import { authorize } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const rows = await q(
      `select id, case_name, to_char(bill_date,'YYYY-MM-DD') as bill_date, subtotal, data, note,
              updated_by, updated_at
         from gal_bills order by lower(case_name), bill_date desc`);
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
    const name = String(b.case_name || "").trim();
    if (!name) return NextResponse.json({ error: "Name the case." }, { status: 400 });
    if (!b.bill_date) return NextResponse.json({ error: "Give the bill date." }, { status: 400 });
    const rows = await q(
      `insert into gal_bills (case_name, bill_date, subtotal, data, note, updated_by)
       values ($1,$2,$3,$4::jsonb,$5,$6)
       on conflict (lower(case_name), bill_date) do update set
         subtotal = excluded.subtotal, data = excluded.data, note = excluded.note,
         updated_by = excluded.updated_by, updated_at = now()
       returning id`,
      [name, b.bill_date, b.subtotal ?? null, JSON.stringify(b.data || {}), b.note || null, s.email || null]);
    return NextResponse.json({ ok: true, id: rows[0]?.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
