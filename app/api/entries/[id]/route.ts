import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";
import { at, BASE, TIME_TABLE } from "../../../../lib/airtable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELDS = ["entry_date","case_name","time_entry","duration","user_name","user_email","firm","kind","url","content","billed","done","marked_for_deletion"];

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
        if (f === "duration" && (v === "" || v === undefined)) v = null;
        params.push(v);
        sets.push(f + " = $" + params.length);
      }
    }
    if (!sets.length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    params.push(parseInt(p.id, 10));
    await q(`update time_entries set ${sets.join(", ")}, updated_at = now() where id = $${params.length}`, params);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Deleting here has to delete in Airtable too, or the next sync pulls the
// entry straight back in.
export async function DELETE(req: Request, ctx: any) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const p = await ctx.params;
    const id = parseInt(p.id, 10);

    const rows = await q("select airtable_id from time_entries where id = $1", [id]);
    if (!rows.length) return NextResponse.json({ ok: true, already: true });

    const recId = rows[0].airtable_id;
    if (recId) {
      try {
        await at(BASE + "/" + TIME_TABLE + "/" + recId, { method: "DELETE" });
      } catch (e: any) {
        const msg = String(e.message || "");
        // Already gone in Airtable is fine; anything else and we stop, so the
        // two never drift apart silently.
        if (!/\b404\b|NOT_FOUND|MODEL_ID_NOT_FOUND/i.test(msg)) {
          return NextResponse.json({
            error: "Airtable would not delete it, so nothing was removed here either. " + msg,
          }, { status: 502 });
        }
      }
    }

    await q("delete from time_entries where id = $1", [id]);
    return NextResponse.json({ ok: true, airtable: !!recId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
