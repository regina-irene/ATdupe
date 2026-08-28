import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Airtable calculates profit, owner's pay, tax, operating and the Year fields,
// so they are deliberately absent here.
const FIELDS = ["case_name", "pay_date", "amount", "kind", "method", "case_type", "cleared", "notes", "end_date"];

export async function PATCH(req: Request, ctx: any) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const p = await ctx.params;
    const b = await req.json();
    const sets: string[] = [];
    const params: any[] = [];
    for (const f of FIELDS) {
      if (Object.prototype.hasOwnProperty.call(b, f)) {
        let v = b[f];
        if ((f === "pay_date" || f === "end_date" || f === "amount") && (v === "" || v === undefined)) v = null;
        if (f === "amount" && v !== null) {
          if (isNaN(Number(v))) return NextResponse.json({ error: "Amount must be a number." }, { status: 400 });
          v = Number(v);
        }
        params.push(v);
        sets.push(f + " = $" + params.length);
      }
    }
    if (!sets.length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    params.push(parseInt(p.id, 10));
    await q(`update payments set ${sets.join(", ")}, updated_at = now() where id = $${params.length}`, params);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
