import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";
import { tablesIn, baseName } from "../../../../lib/mirror";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request, ctx: any) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const p = await ctx.params;
    const rows = await q("select * from client_boards where base_id = $1", [p.base]);
    if (!rows.length) return NextResponse.json({ error: "That board is not on the list yet." }, { status: 404 });
    const tables = await tablesIn(p.base);
    const counts = await q(
      `select table_key, count(*)::int as n from mirror_rows
        where table_key like 'b:' || $1 || ':%' group by table_key`, [p.base]);
    const byKey: Record<string, number> = {};
    for (const c of counts) byKey[c.table_key] = c.n;
    return NextResponse.json({
      board: rows[0],
      tables: tables.map((t) => ({ ...t, rows: byKey["b:" + p.base + ":" + t.id] || 0 })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: any) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const p = await ctx.params;
    const b = await req.json();
    if (b.renameFromAirtable) {
      const n = await baseName(p.base);
      if (n) await q("update client_boards set label = $2 where base_id = $1", [p.base, n]);
      return NextResponse.json({ ok: true, label: n });
    }
    await q("update client_boards set label = coalesce($2, label), case_name = $3, note = $4 where base_id = $1",
      [p.base, b.label || null, b.case_name ?? null, b.note ?? null]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Removes the board from the list and the mirrored copy. Airtable is untouched.
export async function DELETE(req: Request, ctx: any) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const p = await ctx.params;
    await q("delete from mirror_rows where table_key like 'b:' || $1 || ':%'", [p.base]);
    await q("delete from client_boards where base_id = $1", [p.base]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
