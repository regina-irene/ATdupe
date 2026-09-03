import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../../lib/db";
import { authorize } from "../../../../../lib/auth";
import { resolve, schemaFor, coerce } from "../../../../../lib/mirror";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sets one field on many mirrored rows at once. Only writable Airtable fields
// are accepted, exactly as the single-row edit does, and the value is merged
// into each record so its other fields survive.
export async function PATCH(req: Request, ctx: any) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const p = await ctx.params;
    resolve(p.key);
    const { fields } = await schemaFor(p.key);
    const byId = new Map(fields.map((f) => [f.id, f]));

    const b = await req.json();
    const raw = Array.isArray(b?.ids) ? b.ids : [];
    const list: number[] = [];
    for (const v of raw) {
      const n = parseInt(String(v), 10);
      if (Number.isFinite(n) && list.indexOf(n) < 0) list.push(n);
    }
    if (!list.length) return NextResponse.json({ error: "Nothing was selected" }, { status: 400 });
    if (list.length > 500) return NextResponse.json({ error: "Too many rows at once. Keep it under 500." }, { status: 400 });

    const patch: any = {};
    for (const k of Object.keys(b?.data || {})) {
      const f = byId.get(k);
      if (!f || !f.writable) continue;
      patch[k] = coerce(f, b.data[k]);
    }
    if (!Object.keys(patch).length) return NextResponse.json({ error: "That field cannot be edited here." }, { status: 400 });

    const r = await q(
      `update mirror_rows set data = data || $1::jsonb, updated_at = now()
        where table_key = $2 and id = any($3::bigint[]) returning id`,
      [JSON.stringify(patch), p.key, list]);
    return NextResponse.json({ ok: true, updated: r.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
