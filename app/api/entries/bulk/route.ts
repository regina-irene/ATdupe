import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";
import { at, BASE, TIME_TABLE } from "../../../../lib/airtable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The same list the single-row PATCH accepts, so bulk cannot reach a column
// the one-at-a-time edit would refuse.
const FIELDS = ["entry_date","case_name","time_entry","duration","user_name","user_email","firm","kind","url","content","billed","done","marked_for_deletion"];

function ids(b: any): number[] {
  const raw = Array.isArray(b?.ids) ? b.ids : [];
  const out: number[] = [];
  for (const v of raw) {
    const n = parseInt(String(v), 10);
    if (Number.isFinite(n) && out.indexOf(n) < 0) out.push(n);
  }
  return out;
}

// Applies one set of field values to many entries in a single statement.
// updated_at is bumped so the next sync pushes every one of them to Airtable.
export async function PATCH(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const b = await req.json();
    const list = ids(b);
    if (!list.length) return NextResponse.json({ error: "Nothing was selected" }, { status: 400 });
    if (list.length > 500) return NextResponse.json({ error: "Too many rows at once. Keep it under 500." }, { status: 400 });

    const patch = b?.patch && typeof b.patch === "object" ? b.patch : {};
    const sets: string[] = [];
    const params: any[] = [];
    for (const f of FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(patch, f)) continue;
      let v = patch[f];
      if (f === "duration" && (v === "" || v === undefined)) v = null;
      if ((f === "entry_date" || f === "case_name" || f === "kind" || f === "firm" || f === "user_name") && v === "") v = null;
      params.push(v);
      sets.push(f + " = $" + params.length);
    }
    if (!sets.length) return NextResponse.json({ error: "Pick a field and a value first" }, { status: 400 });

    params.push(list);
    const r = await q(
      `update time_entries set ${sets.join(", ")}, updated_at = now()
         where id = any($${params.length}::int[]) returning id`,
      params
    );
    return NextResponse.json({ ok: true, updated: r.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Deletes have to happen in Airtable first, or the next sync pulls the rows
// back. Airtable takes 10 record ids per call.
export async function DELETE(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const b = await req.json();
    const list = ids(b);
    if (!list.length) return NextResponse.json({ error: "Nothing was selected" }, { status: 400 });

    const rows = await q("select id, airtable_id from time_entries where id = any($1::int[])", [list]);
    if (!rows.length) return NextResponse.json({ ok: true, deleted: 0 });

    const recs = rows.filter((r: any) => r.airtable_id).map((r: any) => r.airtable_id as string);
    const failed: string[] = [];
    let removedThere = 0;
    for (let i = 0; i < recs.length; i += 10) {
      const batch = recs.slice(i, i + 10);
      const qs = batch.map((id) => "records[]=" + encodeURIComponent(id)).join("&");
      try {
        await at(BASE + "/" + TIME_TABLE + "?" + qs, { method: "DELETE" });
        removedThere += batch.length;
      } catch (e: any) {
        const msg = String(e.message || "");
        // Already gone in Airtable is fine. Anything else and those rows stay
        // put here, so the two sides cannot drift apart quietly.
        if (/\b404\b|NOT_FOUND|MODEL_ID_NOT_FOUND/i.test(msg)) { removedThere += batch.length; continue; }
        failed.push(...batch);
      }
    }

    const keep = new Set(failed);
    const deletable = rows.filter((r: any) => !r.airtable_id || !keep.has(r.airtable_id)).map((r: any) => r.id);
    if (deletable.length) await q("delete from time_entries where id = any($1::int[])", [deletable]);

    return NextResponse.json({
      ok: true, deleted: deletable.length, airtable: removedThere,
      error: failed.length
        ? `${failed.length} could not be deleted in Airtable, so they were left here too. The rest were removed.`
        : undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
