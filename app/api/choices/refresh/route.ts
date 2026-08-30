import { NextResponse } from "next/server";
import { q, ensureSchema, setState } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Drops every cached Airtable schema so the next read re-fetches colours,
// field names and new choices.
export async function POST(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    await setState("choice_colors_at", "0");
    const r = await q("delete from sync_state where key like 'mirror_schema_%' returning key");
    return NextResponse.json({ ok: true, cleared: r.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
