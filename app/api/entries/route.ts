import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../lib/db";
import { authorize } from "../../../lib/auth";
import { buildWhere, orderBy } from "../../../lib/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const sp = new URL(req.url).searchParams;
    const { sql, params } = buildWhere(sp);
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
    const pageSize = Math.min(2000, Math.max(1, parseInt(sp.get("pageSize") || "50", 10)));
    const rows = await q(`select id, to_char(entry_date,'YYYY-MM-DD') as entry_date, case_name, time_entry, duration, user_name, user_email, firm, kind, url, content, billed, airtable_id from time_entries ${sql} ${orderBy(sp)} limit ${pageSize} offset ${(page - 1) * pageSize}`, params);
    const agg = await q(`select count(*)::int as total, coalesce(sum(duration),0)::float as hours from time_entries ${sql}`, params);
    const users = await q(`select distinct user_name from time_entries where user_name is not null and user_name <> '' order by user_name limit 60`);
    return NextResponse.json({ rows, total: agg[0]?.total || 0, hours: agg[0]?.hours || 0, users: users.map((u: any) => u.user_name) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await authorize(req);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const b = await req.json();
    const rows = await q(
      `insert into time_entries (entry_date, case_name, time_entry, duration, user_name, user_email, firm, kind, url, content, email_from, email_to, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
      [b.entry_date || new Date().toISOString().slice(0, 10), b.case_name || null, b.time_entry || null,
       b.duration === undefined || b.duration === null || b.duration === "" ? null : b.duration,
       b.user_name || session.name, b.user_email || session.email, b.firm || "EFL", b.kind || null,
       b.url || null, b.content || null, b.email_from || null, b.email_to || null,
       session.email === "automation@efl" ? "api" : "web"]
    );
    if (b.case_name) await q(`insert into cases (id, name, source) values ('manual:' || lower($1), $2, 'manual') on conflict (id) do nothing`, [b.case_name, b.case_name]);
    return NextResponse.json({ ok: true, id: rows[0]?.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
