import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELDS = ["client_name","case_name","task","status","priority","who","ord","closed","due_date","link","duration"];

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
        if ((f === "due_date" || f === "ord" || f === "duration") && (v === "" || v === undefined)) v = null;
        params.push(v);
        sets.push(f + " = $" + params.length);
      }
    }
    if (!sets.length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    params.push(parseInt(p.id, 10));
    await q(`update tasks set ${sets.join(", ")}, updated_at = now() where id = $${params.length}`, params);
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
    await q("delete from tasks where id = $1", [parseInt(p.id, 10)]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
