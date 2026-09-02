import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Corrections by hand: the as-of date, the case, or a party's opening retainer.
export async function PATCH(req: Request, ctx: any) {
  const s = await authorize(req);
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const p = await ctx.params;
    const id = parseInt(p.id, 10);
    const b = await req.json();
    const cur = await q("select data from gal_bills where id = $1", [id]);
    if (!cur.length) return NextResponse.json({ error: "That bill is no longer there." }, { status: 404 });

    const data = cur[0].data || {};
    if (b.initials && typeof b.initials === "object") {
      data.parties = data.parties || {};
      for (const name of Object.keys(b.initials)) {
        if (!data.parties[name]) continue;
        const v = b.initials[name];
        data.parties[name].initial = v === "" || v === null ? null : Number(v);
      }
    }
    await q(
      `update gal_bills set
         case_name = coalesce($2, case_name),
         bill_date = coalesce($3::date, bill_date),
         data = $4::jsonb, note = coalesce($5, note),
         updated_by = $6, updated_at = now()
       where id = $1`,
      [id, b.case_name || null, b.bill_date || null, JSON.stringify(data), b.note ?? null, s.email || null]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: any) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const p = await ctx.params;
    await q("delete from gal_bills where id = $1", [parseInt(p.id, 10)]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
