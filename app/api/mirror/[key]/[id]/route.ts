import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../../lib/db";
import { authorize } from "../../../../../lib/auth";
import { resolve, schemaFor } from "../../../../../lib/mirror";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: any) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const p = await ctx.params;
    resolve(p.key);
    const { fields } = await schemaFor(p.key);
    const writable = new Set(fields.filter((f) => f.writable).map((f) => f.id));
    const b = await req.json();
    const patch: any = {};
    for (const k of Object.keys(b.data || {})) {
      if (!writable.has(k)) continue;
      patch[k] = b.data[k];
    }
    if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing editable was changed." }, { status: 400 });
    // Merge into the stored record so untouched fields survive.
    await q(
      `update mirror_rows set data = data || $1::jsonb, updated_at = now()
        where id = $2 and table_key = $3`,
      [JSON.stringify(patch), parseInt(p.id, 10), p.key]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
