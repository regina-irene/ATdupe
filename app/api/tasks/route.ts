import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../lib/db";
import { authorize } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sortable columns. Direction comes in separately so headers can toggle.
const COL: Record<string, string> = {
  order: "ord",
  priority: "priority",
  case: "lower(coalesce(case_name, client_name))",
  task: "lower(task)",
  status: "status",
  who: "who",
  due: "due_date",
  modified: "coalesce(at_modified, updated_at)",
  closed: "closed",
};

export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const sp = new URL(req.url).searchParams;
    const where: string[] = [];
    const params: any[] = [];
    const add = (c: string, v: any) => { params.push(v); where.push(c.replace("?", "$" + params.length)); };

    if (sp.get("closed") !== "1") where.push("closed = false");
    if (sp.get("who")) add("who ilike ?", "%" + sp.get("who") + "%");
    if (sp.get("status")) add("status = ?", sp.get("status"));
    if (sp.get("priority")) add("priority = ?", sp.get("priority"));
    if (sp.get("case")) add("(case_name ilike ? or client_name ilike ?)".replace("?", "$X"), null);
    if (sp.get("case")) {
      where.pop(); params.pop();
      params.push("%" + sp.get("case") + "%");
      const i = params.length;
      where.push(`(case_name ilike $${i} or client_name ilike $${i})`);
    }
    if (sp.get("q")) add("task ilike ?", "%" + sp.get("q") + "%");

    const sql = where.length ? "where " + where.join(" and ") : "";
    const col = COL[sp.get("sort") || "order"] || COL.order;
    const dir = sp.get("dir") === "desc" ? "desc" : "asc";
    const ord = `${col} ${dir} nulls last, ord nulls last, id`;
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(sp.get("pageSize") || "100", 10)));

    const rows = await q(
      `select id, airtable_id, client_name, case_name, task, status, priority, who, ord, closed,
              to_char(due_date,'YYYY-MM-DD') as due_date, link, updated_at, at_modified
         from tasks ${sql} order by ${ord} limit ${pageSize} offset ${(page - 1) * pageSize}`,
      params
    );
    const agg = await q(`select count(*)::int as total from tasks ${sql}`, params);
    return NextResponse.json({ rows, total: agg[0]?.total || 0 });
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
    if (!b.task || !String(b.task).trim()) return NextResponse.json({ error: "Describe the task." }, { status: 400 });
    const rows = await q(
      `insert into tasks (client_name, case_name, task, status, priority, who, ord, due_date, link, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'web') returning id`,
      [b.client_name || b.case_name || null, b.case_name || null, b.task, b.status || null,
       b.priority || null, b.who || null,
       b.ord === "" || b.ord === undefined ? null : b.ord,
       b.due_date || null, b.link || null]
    );
    return NextResponse.json({ ok: true, id: rows[0]?.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
