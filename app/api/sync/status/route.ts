import { NextResponse } from "next/server";
import { q, ensureSchema, getState } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const last = await q("select * from sync_log where coalesce(kind,'time')='time' order by id desc limit 1");
    const lastTask = await q("select * from sync_log where kind='tasks' order by id desc limit 1");
    const counts = await q(
      `select count(*)::int as total, count(airtable_id)::int as linked,
              count(*) filter (where source in ('web','api'))::int as own_entries,
              count(*) filter (where airtable_id is null and source in ('web','api'))::int as pending
         from time_entries`
    );
    const tk = await q(`select count(*)::int as total, count(*) filter (where closed=false)::int as open, count(airtable_id)::int as linked from tasks`);
    const cursor = await getState("backfill_cursor");
    return NextResponse.json({
      last: last[0] || null, lastTask: lastTask[0] || null,
      counts: counts[0], tasks: tk[0],
      backfill_in_progress: !!cursor, backfill_count: await getState("backfill_count"),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
