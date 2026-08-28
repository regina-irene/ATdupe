import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../../lib/db";
import { authorize } from "../../../../lib/auth";
import { MIRRORS, schemaFor, isNumber } from "../../../../lib/mirror";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request, ctx: any) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const p = await ctx.params;
    if (!MIRRORS[p.key]) return NextResponse.json({ error: "Unknown board" }, { status: 404 });
    const { fields } = await schemaFor(p.key);
    const byId = new Map(fields.map((f) => [f.id, f] as const));

    const sp = new URL(req.url).searchParams;
    const where = ["table_key = $1"];
    const params: any[] = [p.key];
    const add = (clause: string, v: any) => { params.push(v); where.push(clause.replace("?", "$" + params.length)); };

    // Free text across every field.
    if (sp.get("q")) add("data::text ilike ?", "%" + sp.get("q") + "%");

    // Repeatable f=<fieldId>:<value> pairs, one field allowing several values.
    const byField = new Map<string, string[]>();
    for (const raw of sp.getAll("f")) {
      const i = raw.indexOf(":");
      if (i < 1) continue;
      const fid = raw.slice(0, i), val = raw.slice(i + 1);
      byField.set(fid, [...(byField.get(fid) || []), val]);
    }
    for (const [fid, vals] of byField) {
      const f = byId.get(fid);
      if (!f) continue;
      if (f.type === "multipleSelects") {
        // jsonb array contains any of the chosen values
        const ors = vals.map((v) => { params.push(JSON.stringify([v])); return `data->'${fid}' @> $${params.length}::jsonb`; });
        where.push("(" + ors.join(" or ") + ")");
      } else if (f.type === "checkbox") {
        params.push(vals[0] === "true");
        where.push(`coalesce((data->'${fid}')::boolean, false) = $${params.length}`);
      } else {
        params.push(vals);
        where.push(`data->>'${fid}' = any($${params.length}::text[])`);
      }
    }

    const sortF = sp.get("sort") || "";
    const dir = sp.get("dir") === "desc" ? "desc" : "asc";
    let ord = "id " + dir;
    if (sortF && byId.has(sortF)) {
      const f = byId.get(sortF)!;
      const path = `data->>'${sortF}'`;
      ord = isNumber(f.type) ? `(nullif(${path},''))::numeric ${dir} nulls last, id`
        : f.type === "date" || f.type === "dateTime" ? `(nullif(${path},''))::timestamptz ${dir} nulls last, id`
        : `lower(${path}) ${dir} nulls last, id`;
    } else if (sortF === "_modified") {
      ord = `coalesce(at_modified, updated_at) ${dir}, id`;
    }

    const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(sp.get("pageSize") || "100", 10)));
    const sql = "where " + where.join(" and ");

    const rows = await q(
      `select id, airtable_id, data, at_modified, updated_at, source
         from mirror_rows ${sql} order by ${ord} limit ${pageSize} offset ${(page - 1) * pageSize}`, params);
    const agg = await q(`select count(*)::int as total from mirror_rows ${sql}`, params);
    return NextResponse.json({ rows, total: agg[0]?.total || 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: any) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const p = await ctx.params;
    if (!MIRRORS[p.key]) return NextResponse.json({ error: "Unknown board" }, { status: 404 });
    const { fields, primary } = await schemaFor(p.key);
    const writable = new Set(fields.filter((f) => f.writable).map((f) => f.id));
    const b = await req.json();
    const data: any = {};
    for (const k of Object.keys(b.data || {})) if (writable.has(k)) data[k] = b.data[k];
    if (!data[primary] && !Object.keys(data).length)
      return NextResponse.json({ error: "Fill in at least the name." }, { status: 400 });
    const rows = await q(
      "insert into mirror_rows (table_key, data, source) values ($1,$2::jsonb,'web') returning id",
      [p.key, JSON.stringify(data)]);
    return NextResponse.json({ ok: true, id: rows[0]?.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
