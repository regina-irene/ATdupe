import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dropdown options come from the data itself, so they always match Airtable.
export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const s = await q("select distinct status from tasks where status is not null and status <> '' order by status");
    const p = await q("select distinct priority from tasks where priority is not null and priority <> '' order by priority");
    return NextResponse.json({
      statuses: s.map((r: any) => r.status),
      priorities: p.map((r: any) => r.priority),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
