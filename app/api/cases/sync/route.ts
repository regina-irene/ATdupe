import { NextResponse } from "next/server";
import { db, ensureSchema } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";
import { at, BASE, STATUS_TABLE } from "../../../../lib/airtable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function sync() {
  await ensureSchema();
  let offset: string | undefined;
  let count = 0;
  do {
    const p = new URLSearchParams({ pageSize: "100" });
    p.append("fields[]", "Case Name");
    p.append("fields[]", "Closed");
    if (offset) p.set("offset", offset);
    const j = await at(BASE + "/" + STATUS_TABLE + "?" + p.toString());
    const params: any[] = [];
    const tuples: string[] = [];
    for (const rec of j.records || []) {
      const name = (rec.fields["Case Name"] || "").toString().trim();
      if (!name) continue;
      params.push(rec.id, name, !!rec.fields["Closed"]);
      const i = params.length;
      tuples.push(`($${i - 2},$${i - 1},$${i},'airtable',now())`);
      count++;
    }
    if (tuples.length) {
      await db()(`insert into cases (id, name, closed, source, updated_at) values ${tuples.join(",")} on conflict (id) do update set name=excluded.name, closed=excluded.closed, updated_at=now()`, params);
    }
    offset = j.offset;
  } while (offset);
  return count;
}

async function handle(req: Request) {
  const ok = !!req.headers.get("x-vercel-cron") || !!(await authorize(req));
  if (!ok) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try { return NextResponse.json({ ok: true, cases: await sync() }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export const GET = handle;
export const POST = handle;
