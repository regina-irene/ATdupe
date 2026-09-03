import { NextResponse } from "next/server";
import { q, ensureSchema } from "../../../lib/db";
import { authorize } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The list is deliberately without the html, which can run to megabytes.
export async function GET(req: Request) {
  if (!(await authorize(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const sp = new URL(req.url).searchParams;
    const id = sp.get("id");
    if (id) {
      const rows = await q("select * from questionnaires where id = $1", [parseInt(id, 10)]);
      if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ row: rows[0] });
    }
    const rows = await q(
      `select id, case_name, party, title, source_file, note, uploaded_by, created_at, updated_at,
              length(html) as size
         from questionnaires order by lower(case_name), lower(party)`);
    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const s = await authorize(req);
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const b = await req.json();
    const caseName = String(b.case_name || "").trim();
    const party = String(b.party || "").trim();
    if (!caseName || !party) return NextResponse.json({ error: "A case and a party are needed." }, { status: 400 });
    if (!b.html) return NextResponse.json({ error: "No questionnaire content." }, { status: 400 });
    await q(
      `insert into questionnaires (case_name, party, title, html, source_file, note, uploaded_by)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (lower(case_name), lower(party)) do update set
         title = excluded.title, html = excluded.html, source_file = excluded.source_file,
         note = coalesce(excluded.note, questionnaires.note),
         uploaded_by = excluded.uploaded_by, updated_at = now()`,
      [caseName, party, b.title || null, b.html, b.source_file || null, b.note || null, s.email || null]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
