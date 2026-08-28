import { NextResponse } from "next/server";
import { q, ensureSchema, setState } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Clears rows from THIS app's database only. Nothing in Airtable is touched.
export async function POST(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const b = await req.json();
    if (b.confirm !== "DELETE") return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });
    const before = await q("select count(*)::int as n from time_entries");
    if (b.scope === "all") await q("delete from time_entries");
    else await q("delete from time_entries where source = 'airtable'");
    const after = await q("select count(*)::int as n from time_entries");
    await setState("backfill_cursor", null);
    await setState("backfill_count", null);
    await setState("backfill_offset", null);
    return NextResponse.json({ ok: true, deleted: before[0].n - after[0].n, remaining: after[0].n });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
