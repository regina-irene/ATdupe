import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Airtable calculates profit, owner's pay, tax, operating and the Year fields,
// so they are deliberately absent here, exactly as in the single-row edit.
const FIELDS = ["case_name", "pay_date", "amount", "kind", "method", "case_type", "cleared", "notes", "end_date"];

export async function PATCH(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const b = await req.json();
    const raw = Array.isArray(b?.ids) ? b.ids : [];
    const list: number[] = [];
    for (const v of raw) {
      const n = parseInt(String(v), 10);
      if (Number.isFinite(n) && list.indexOf(n) < 0) list.push(n);
    }
    if (!list.length) return NextResponse.json({ error: "Nothing was selected" }, { status: 400 });
    if (list.length > 500) return NextResponse.json({ error: "Too many rows at once. Keep it under 500." }, { status: 400 });

    const patch = b?.patch && typeof b.patch === "object" ? b.patch : {};
    const sets: string[] = [];
    const params: any[] = [];
    for (const f of FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(patch, f)) continue;
      let v = patch[f];
      if ((f === "pay_date" || f === "end_date" || f === "amount") && (v === "" || v === undefined)) v = null;
      if ((f === "kind" || f === "method" || f === "case_type" || f === "cleared" || f === "case_name") && v === "") v = null;
      if (f === "amount" && v !== null) {
        if (isNaN(Number(v))) return NextResponse.json({ error: "Amount must be a number." }, { status: 400 });
        v = Number(v);
      }
      params.push(v);
      sets.push(f + " = $" + params.length);
    }
    if (!sets.length) return NextResponse.json({ error: "Pick a field and a value first" }, { status: 400 });

    params.push(list);
    const r = await q(
      `update payments set ${sets.join(", ")}, updated_at = now()
         where id = any($${params.length}::bigint[]) returning id`,
      params
    );
    return NextResponse.json({ ok: true, updated: r.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
