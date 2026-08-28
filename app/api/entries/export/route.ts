import { q, ensureSchema } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";
import { buildWhere, orderBy } from "../../../../lib/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function esc(v: any) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function GET(req: Request) {
  if (!(await authorize(req))) return new Response("Not signed in", { status: 401 });
  await ensureSchema();
  const sp = new URL(req.url).searchParams;
  const { sql, params } = buildWhere(sp);
  const rows = await q(
    `select to_char(entry_date,'YYYY-MM-DD') as d, case_name, time_entry, duration, user_name, firm, kind, url, billed
       from time_entries ${sql} ${orderBy(sp)} limit 100000`,
    params
  );
  const head = "Date,Case,Entry,Hours,Who,Firm,Type,Link,Billed\n";
  const body = rows.map((r: any) => [r.d, r.case_name, r.time_entry, r.duration, r.user_name, r.firm, r.kind, r.url, r.billed].map(esc).join(",")).join("\n");
  return new Response("﻿" + head + body, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="EFL-time-' + new Date().toISOString().slice(0, 10) + '.csv"' },
  });
}
