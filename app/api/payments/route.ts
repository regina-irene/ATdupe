import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../lib/db";
import { authorize } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COL: Record<string, string> = {
  date: "pay_date",
  amount: "amount",
  case: "lower(case_name)",
  kind: "kind",
  method: "method",
  type: "case_type",
  cleared: "cleared",
  notes: "lower(notes)",
  modified: "coalesce(at_modified, updated_at)",
};

export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const sp = new URL(req.url).searchParams;
    const where: string[] = [];
    const params: any[] = [];
    const add = (c: string, v: any) => { params.push(v); where.push(c.replace("?", "$" + params.length)); };

    if (sp.get("case")) add("case_name ilike ?", "%" + sp.get("case") + "%");
    const many = (name: string, col: string, cast = "text") => {
      const vals = sp.getAll(name).filter(Boolean);
      if (vals.length) add(`${col} = any(?::${cast}[])`, vals);
    };
    many("kind", "kind");
    many("method", "method");
    many("type", "case_type");
    many("cleared", "cleared");
    if (sp.get("q")) add("notes ilike ?", "%" + sp.get("q") + "%");
    if (sp.get("from")) add("pay_date >= ?::date", sp.get("from"));
    if (sp.get("to")) add("pay_date <= ?::date", sp.get("to"));
    many("year", "year", "int");

    const sql = where.length ? "where " + where.join(" and ") : "";
    const col = COL[sp.get("sort") || "date"] || COL.date;
    const dir = sp.get("dir") === "asc" ? "asc" : "desc";
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(sp.get("pageSize") || "100", 10)));

    const rows = await q(
      `select id, airtable_id, case_name, to_char(pay_date,'YYYY-MM-DD') as pay_date, amount,
              kind, method, case_type, cleared, notes, to_char(end_date,'YYYY-MM-DD') as end_date,
              year, year_mm, profit, owner_pay, tax, operating, at_modified, updated_at
         from payments ${sql} order by ${col} ${dir} nulls last, id desc
         limit ${pageSize} offset ${(page - 1) * pageSize}`,
      params
    );
    const agg = await q(
      `select count(*)::int as total, coalesce(sum(amount),0)::numeric as sum_amount,
              coalesce(sum(profit),0)::numeric as sum_profit, coalesce(sum(tax),0)::numeric as sum_tax
         from payments ${sql}`, params);
    return NextResponse.json({
      rows,
      total: agg[0]?.total || 0,
      sum_amount: Number(agg[0]?.sum_amount || 0),
      sum_profit: Number(agg[0]?.sum_profit || 0),
      sum_tax: Number(agg[0]?.sum_tax || 0),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const b = await req.json();
    if (b.amount === "" || b.amount === undefined || b.amount === null || isNaN(Number(b.amount)))
      return NextResponse.json({ error: "Enter an amount." }, { status: 400 });
    if (!b.pay_date) return NextResponse.json({ error: "Enter the payment date." }, { status: 400 });
    const rows = await q(
      `insert into payments (case_name, pay_date, amount, kind, method, case_type, cleared, notes, end_date, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'web') returning id`,
      [b.case_name || null, b.pay_date, Number(b.amount), b.kind || null, b.method || null,
       b.case_type || null, b.cleared || null, b.notes || null, b.end_date || null]
    );
    return NextResponse.json({ ok: true, id: rows[0]?.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
